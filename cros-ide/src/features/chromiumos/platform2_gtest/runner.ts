// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as vscode from 'vscode';
import * as services from '../../../services';
import * as metrics from '../../metrics/metrics';
// TODO(oka): Move ebuild under src/services/chromiumos.
import * as ebuild from '../cpp_code_completion/compdb_service/ebuild';
import {GtestCase} from './gtest_case';
import {GtestWorkspace} from './gtest_workspace';

const PLATFORM2_TEST_PY =
  '/mnt/host/source/src/platform2/common-mk/platform2_test.py';

const DEBUG_EXTENSION_ID = 'webfreak.debug';

/**
 * Runs gtest cases according to the given request. If debugging is requested,
 * it runs the test under gdbserver, and attaches debugger to it.
 */
export class Runner {
  constructor(
    private readonly chrootService: services.chromiumos.ChrootService,
    private readonly request: vscode.TestRunRequest,
    private readonly cancellation: vscode.CancellationToken,
    private readonly testRun: vscode.TestRun,
    private readonly board: string,
    private readonly gtestWorkspace: GtestWorkspace
  ) {}

  private readonly platform2 = path.join(
    this.chrootService.source.root,
    'src/platform2'
  );

  private readonly output = {
    append: (x: string) => this.testRun.appendOutput(x.replace(/\n/g, '\r\n')),
    appendLine: (x: string) =>
      this.testRun.appendOutput((x + '\n').replace(/\n/g, '\r\n')),
  };

  async run() {
    const atomToTests = await this.atomToTests();

    metrics.send({
      category: 'interactive',
      group: 'debugging',
      action:
        this.request.profile?.kind === vscode.TestRunProfileKind.Run
          ? 'run platform2 gtests'
          : 'debug platform2 gtests',
      // Package names.
      label: [...atomToTests.keys()].sort().join(' '),
      // Number of tests to run.
      value: [...atomToTests.values()]
        .map(x => x.length)
        .reduce((x, y) => x + y),
    });

    // Run tests per package.
    for (const [atom, tests] of atomToTests.entries()) {
      // Compile the package for unit test executables.
      let buildDir: string;
      try {
        buildDir = await this.compileOrThrow(atom);
      } catch (e) {
        const message = new vscode.TestMessage((e as Error).message);
        for (const test of tests) {
          this.testRun.failed(test.item, message);
        }
        continue;
      }

      // Collect all the test cases.
      const gtestInfos = await this.collectGtests(buildDir);
      const testNameToInfo = new Map<string, GTestInfo>();
      for (const t of gtestInfos) {
        for (const name of t.testNames) {
          testNameToInfo.set(name, t);
        }
      }

      // Run the tests with reporting the results.
      for (const test of tests) {
        const gtestInfo = testNameToInfo.get(test.testName);
        if (!gtestInfo) {
          this.testRun.failed(
            test.item,
            new vscode.TestMessage(
              `gtest executable to run ${test.testName} was not found in chroot build dir ${buildDir}`
            )
          );
          continue;
        }

        this.testRun.started(test.item);

        const startTime = new Date();
        let error: Error | undefined;
        try {
          if (this.request.profile?.kind === vscode.TestRunProfileKind.Run) {
            await this.runTestOrThrow(gtestInfo.executable, test);
          } else {
            await this.debugTestOrThrow(gtestInfo, test);
          }
        } catch (e) {
          error = e as Error;
        }

        const duration =
          new Date().getMilliseconds() - startTime.getMilliseconds();

        if (this.cancellation.isCancellationRequested) {
          this.testRun.skipped(test.item);
        } else if (error) {
          this.testRun.failed(
            test.item,
            new vscode.TestMessage(error.message),
            duration
          );
        } else {
          this.testRun.passed(test.item, duration);
        }
      }
    }
  }

  /**
   * Returns a map from a package to the test cases to run in the package. It
   * iterates all the tests to run, and marks a test as enqueued if a package
   * containing the test is found, or as skipped otherwise.
   */
  private async atomToTests(): Promise<
    Map<services.chromiumos.Atom, GtestCase[]>
  > {
    const packages = services.chromiumos.Packages.getOrCreate(
      this.chrootService
    );

    const atomToTests = new Map<services.chromiumos.Atom, GtestCase[]>();
    await this.gtestWorkspace.forEachMatching(this.request, async testCase => {
      const packageInfo = await packages.fromFilepath(testCase.uri.fsPath);
      if (!packageInfo) {
        this.output.append(
          `Skip ${testCase.testName}: found no package info for ${testCase.uri.fsPath}\n`
        );
        this.testRun.skipped(testCase.item);
        return;
      }
      this.testRun.enqueued(testCase.item);

      const tests = atomToTests.get(packageInfo.atom);
      if (tests) {
        tests.push(testCase);
      } else {
        atomToTests.set(packageInfo.atom, [testCase]);
      }
    });

    return atomToTests;
  }

  /**
   * Compiles the tests for the package, and returns the build directory
   * (absolute path from chroot), under which gtest executables are located.
   */
  private async compileOrThrow(atom: string): Promise<string> {
    // HACK: We don't need compdb (compilation database) here, but still pass
    // the compilation_database flag, because internally the Ebuild class
    // hard-codes the filename of compdb and use it as a marker to find the
    // build directory containing it. Without the flag compdb is not generated
    // and the directory is not found, but we actually need it to find the gtest
    // executables under the directory. It's not easy to find the directory by
    // other means because its path depends on the package configuration but
    // it's hard to parse the configuration. The Ebuild class just iterates over
    // all the possibilities and finds the directory containing the compdb.
    //
    // TODO(b:254145837): Update the Ebuild implementation to use other well-known file
    // name rather than compdb to find the build directory, and remove the
    // compilation_database flag here.
    const ebuildInstance = new ebuild.Ebuild(
      this.board,
      atom,
      this.output,
      this.chrootService.crosFs,
      ['compilation_database', 'test'],
      this.cancellation
    );
    // generate() throws on failure.
    const compilationDatabase = await ebuildInstance.generate();
    if (!compilationDatabase) {
      throw new Error(`failed to compile ${atom}`);
    }
    return path.dirname(compilationDatabase);
  }

  /**
   * Heuristically finds all the gtest executables under the build directory and
   * returns gtest executables under the directory.
   *
   * TODO(oka): What executables are run when the package is emerged with the
   * FEATURES=test flag is written in the platform_pkg_tests function of the
   * package's ebuild file.
   * https://chromium.googlesource.com/chromiumos/docs/+/HEAD/platform2_primer.md#example-ebuild
   * Therefore ideally we should parse the platform_pkg_tests function as a
   * shell script and collect all the executable names passed to platform_test.
   */
  private async collectGtests(buildDir: string): Promise<GTestInfo[]> {
    // We consider an executable a gtest if it contains one of the following markers.
    const gtestMarker = new Set(['usr/include/gtest/gtest.h', 'libgtest.so']);

    const results: GTestInfo[] = [];

    // Parallelize time consuming operations.
    const listTestsOperations: Promise<void>[] = [];

    for (const fileName of await this.chrootService.chroot.readdir(buildDir)) {
      if (this.cancellation.isCancellationRequested) {
        return [];
      }
      const fileInChroot = path.join(buildDir, fileName);
      try {
        const stat = await this.chrootService.chroot.stat(fileInChroot);
        const isExecutableFile =
          (stat.mode & fs.constants.S_IXUSR) > 0 && stat.isFile();
        if (!isExecutableFile) {
          continue;
        }
      } catch (e) {
        this.output.appendLine((e as Error).message);
        continue;
      }

      listTestsOperations.push(
        (async () => {
          const stringsResult = await this.chrootService.exec(
            'strings',
            [fileInChroot],
            {
              sudoReason: 'to run test',
              logger: this.output,
              cancellationToken: this.cancellation,
            }
          );
          if (stringsResult instanceof Error) {
            this.output.appendLine(stringsResult.message);
            return;
          }
          const strings = stringsResult.stdout.split('\n');

          const isGtest = strings.find(s => gtestMarker.has(s));
          if (!isGtest) {
            return;
          }

          const testNames = await this.listTests(fileInChroot);
          if (testNames instanceof Error) {
            this.output.appendLine(testNames.message);
            return;
          }

          const platform2Dirs = new Set<string>();
          for (const line of strings) {
            // testrunner.cc is the entrypoint of all the platform2 unit tests.
            // Use the file as a needle to find the location of the platform2
            // directory relative to the executable, which we later use for path
            // substitutions.
            const m = /^(.*\/platform2)\/common-mk\/testrunner\.cc$/.exec(line);
            if (m) {
              platform2Dirs.add(m[1]);
            }
          }
          if (platform2Dirs.size === 0) {
            return;
          }

          results.push({
            testNames,
            executable: fileInChroot,
            platform2Dirs: [...platform2Dirs.values()],
          });
        })()
      );
    }

    await Promise.all(listTestsOperations);

    return results;
  }

  private async listTests(gtestInChroot: string): Promise<string[] | Error> {
    const result = await this.chrootService.exec(
      PLATFORM2_TEST_PY,
      [`--board=${this.board}`, gtestInChroot, '--', '--gtest_list_tests'],
      {
        sudoReason: 'to run test',
        logger: this.output,
        logStdout: true,
        cancellationToken: this.cancellation,
      }
    );
    if (result instanceof Error) {
      return result;
    }
    return parseTestList(result.stdout);
  }

  private async runTestOrThrow(executableInChroot: string, test: GtestCase) {
    let message = '';
    const result = await this.chrootService.exec(
      PLATFORM2_TEST_PY,
      [
        `--board=${this.board}`,
        executableInChroot,
        '--',
        // The *s are need for value-parameterized tests defined with TEST_P.
        `--gtest_filter=*${test.testName}*`,
      ],
      {
        sudoReason: 'to run test',
        cancellationToken: this.cancellation,
        logger: {
          append: x => {
            this.output.append(x);
            message += x;
          },
        },
        logStdout: true,
      }
    );
    if (result instanceof Error) {
      this.output.appendLine(result.message);
      // TODO(oka): Strip ANSI coloring from the message. The logger supports
      // ANSI coloring, but the TestMessage doesn't.
      throw new Error(message);
    }
  }

  private async debugTestOrThrow(gtestInfo: GTestInfo, test: GtestCase) {
    if (!vscode.extensions.getExtension(DEBUG_EXTENSION_ID)) {
      void (async () => {
        const INSTALL = 'Install';
        const choice = await vscode.window.showInformationMessage(
          'Native Debug extension is needed for debugging',
          INSTALL
        );
        if (choice === INSTALL) {
          await vscode.commands.executeCommand(
            'extension.open',
            DEBUG_EXTENSION_ID
          );
          await vscode.commands.executeCommand(
            'workbench.extensions.installExtension',
            DEBUG_EXTENSION_ID
          );
        }
      })();
      throw new Error(
        'Native Debug extension is not installed; install it and rerun the operation'
      );
    }

    // Find unused port.
    const srv = net.createServer(sock => {
      sock.end();
    });
    const port = await new Promise(resolve => {
      srv.listen(0, () => {
        resolve((srv.address() as net.AddressInfo).port);
      });
    });
    srv.close();

    const sysroot = `/build/${this.board}`;
    const pathInSysroot = gtestInfo.executable.substring(sysroot.length);

    const ongoingTest = this.chrootService.exec(
      PLATFORM2_TEST_PY,
      [
        '--no-ns-net',
        `--board=${this.board}`,
        '/bin/bash',
        '--',
        '-c',
        `gdbserver :${port} ${pathInSysroot} --gtest_filter=*${test.testName}*`,
      ],
      {
        sudoReason: 'to run test under gdbserver',
        logger: this.output,
        logStdout: true,
        cancellationToken: this.cancellation,
      }
    );

    const pathSubstitutions: {[pathInChroot: string]: string} = {
      '/': this.chrootService.chroot.root,
    };
    for (const platform2InChroot of gtestInfo.platform2Dirs) {
      pathSubstitutions[platform2InChroot] = this.platform2;
    }

    // See https://github.com/WebFreak001/code-debug/blob/master/package.json
    // for the meaning of the fields.
    const debugConfiguration: vscode.DebugConfiguration = {
      type: 'gdb',
      name: 'GDB on platform2 unittests',
      request: 'attach',

      cwd: this.platform2,
      pathSubstitutions,
      printCalls: true,
      remote: true,
      target: `:${port}`,
      valuesFormatting: 'prettyPrinters',
    };

    this.output.appendLine(
      `CrOS IDE running debugger with the following config: ${JSON.stringify(
        debugConfiguration
      )}`
    );

    await vscode.debug.startDebugging(undefined, debugConfiguration);

    await ongoingTest;
  }
}

type GTestInfo = {
  // Name of tests the executable contains.
  testNames: string[];
  // Path to the executable in chroot.
  executable: string;
  // Possible platform2 directories relative to the executable.
  platform2Dirs: string[];
};

/**
 * Parses output from a gtest executable run with the --gtest_list_tests flag
 * and returns the strings in the form of "<suite>.<name>". The return value may
 * contain duplicate elements for parameterized tests.
 */
function parseTestList(stdout: string): string[] {
  const res = [];
  let suite = '';
  for (const line of stdout.trim().split('\n')) {
    if (line.startsWith('  ')) {
      res.push(suite + line.trim().split('/')[0]);
    } else {
      if (line.includes('/')) {
        suite = line.split('/')[1];
      } else {
        suite = line;
      }
    }
  }
  return res;
}

export const TEST_ONLY = {parseTestList};
