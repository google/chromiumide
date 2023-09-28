// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as vscode from 'vscode';
import {BoardOrHost} from '../../../common/chromiumos/board_or_host';
import {getQualifiedPackageName} from '../../../common/chromiumos/portage/ebuild';
import {
  parsePlatform2EbuildOrThrow,
  platform2TestWorkingDirectory,
} from '../../../common/chromiumos/portage/platform2';
import {MemoryOutputChannel} from '../../../common/memory_output_channel';
import {TeeOutputChannel} from '../../../common/tee_output_channel';
import * as services from '../../../services';
import {AbstractRunner} from '../../gtest/abstract_runner';
import {GtestCase} from '../../gtest/gtest_case';
import * as gtestTestListParser from '../../gtest/gtest_test_list_parser';
import {GtestWorkspace} from '../../gtest/gtest_workspace';
import {Metrics} from '../../metrics/metrics';
// TODO(oka): Move ebuild under src/services/chromiumos.
import * as ebuild from '../cpp_code_completion/compdb_service/ebuild';

const PLATFORM2_TEST_PY =
  '/mnt/host/source/src/platform2/common-mk/platform2_test.py';

const DEBUG_EXTENSION_ID = 'webfreak.debug';

type BuildDirectory = {
  baseDir: string;
  buildDir: string;
};

/**
 * Runs gtest cases according to the given request. If debugging is requested,
 * it runs the test under gdbserver, and attaches debugger to it.
 */
export class Runner extends AbstractRunner {
  constructor(
    private readonly chrootService: services.chromiumos.ChrootService,
    request: vscode.TestRunRequest,
    cancellation: vscode.CancellationToken,
    testRun: vscode.TestRun,
    private readonly board: BoardOrHost,
    gtestWorkspace: GtestWorkspace
  ) {
    super(request, cancellation, testRun, gtestWorkspace);
  }

  private readonly platform2 = path.join(
    this.chrootService.source.root,
    'src/platform2'
  );

  protected override async doRun(): Promise<void> {
    const packageToTests = await this.packageToTests();

    const name =
      this.request.profile?.kind === vscode.TestRunProfileKind.Run
        ? ('debugging_run_gtest' as const)
        : ('debugging_debug_gtest' as const);

    Metrics.send({
      category: 'interactive',
      group: 'debugging',
      name: name,
      description:
        this.request.profile?.kind === vscode.TestRunProfileKind.Run
          ? 'run platform2 gtests'
          : 'debug platform2 gtests',
      // Package names.
      package_names: [...packageToTests.keys()].sort().join(' '),
      // Number of tests to run.
      tests_count: [...packageToTests.values()]
        .map(x => x.length)
        .reduce((x, y) => x + y),
    });

    // Run tests per package.
    for (const [packageName, tests] of packageToTests.entries()) {
      const ebuildInstance = this.createEbuild(packageName);

      // Compile the package for unit test executables.
      let buildDir: BuildDirectory;
      try {
        buildDir = await this.compileOrThrow(ebuildInstance);
      } catch (e) {
        const message = new vscode.TestMessage((e as Error).message);
        for (const test of tests) {
          this.testRun.failed(test.item, message);
        }
        continue;
      }

      // Collect all the test cases.
      const gtestInfos = await this.collectGtests(buildDir);
      const suiteAndCaseNameToInfo = new Map<string, GTestInfo>();
      for (const t of gtestInfos) {
        // TODO(cmfcmf): This should support parameterized and typed tests.
        for (const suiteAndCaseName of t.testNames.getSuiteAndCaseNames()) {
          suiteAndCaseNameToInfo.set(suiteAndCaseName, t);
        }
      }

      let workingDir = '/tmp';
      try {
        workingDir = await this.getWorkingDirectoryOrThrow(ebuildInstance);
      } catch (e: unknown) {
        // TODO(oka): Send metrics here after migration to GA4 finishes.
        void vscode.window.showWarningMessage(
          `Failed to compute the directory to run tests: ${e}; using ${workingDir} as a fallback`
        );
      }

      // Run the tests with reporting the results.
      for (const test of tests) {
        const gtestInfo = suiteAndCaseNameToInfo.get(test.suiteAndCaseName);
        if (!gtestInfo) {
          this.testRun.failed(
            test.item,
            new vscode.TestMessage(
              `gtest executable to run ${test.suiteAndCaseName} was not found in chroot build dir ${buildDir}`
            )
          );
          continue;
        }

        this.testRun.started(test.item);

        const startTime = new Date();
        let error: Error | undefined;
        try {
          if (this.request.profile?.kind === vscode.TestRunProfileKind.Run) {
            await this.runTestOrThrow(gtestInfo.executable, test, workingDir);
          } else {
            await this.debugTestOrThrow(gtestInfo, test, workingDir);
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

  /** Computes the working directory to run the tests. */
  private async getWorkingDirectoryOrThrow(ebuildInstance: ebuild.Ebuild) {
    const ebuildFilepathInChroot = await ebuildInstance.ebuild9999();
    const ebuildFilepathOutsideChroot = path.join(
      this.chrootService.source.root,
      ebuildFilepathInChroot.substring('/mnt/host/source/'.length)
    );

    let platform2Package;
    try {
      platform2Package = await parsePlatform2EbuildOrThrow(
        ebuildFilepathOutsideChroot
      );
    } catch (e: unknown) {
      throw new Error(`parsing ${ebuildFilepathOutsideChroot} failed: ${e}`);
    }

    const workingDir = platform2TestWorkingDirectory(
      this.board,
      platform2Package
    );
    return workingDir;
  }

  /**
   * Returns a map from a package to the test cases to run in the package. It
   * iterates all the tests to run, and marks a test as enqueued if a package
   * containing the test is found, or as skipped otherwise.
   */
  private async packageToTests(): Promise<Map<string, GtestCase[]>> {
    const packages = services.chromiumos.Packages.getOrCreate(
      this.chrootService
    );

    // Keyed by qualified package names.
    const packageToTests = new Map<string, GtestCase[]>();
    for (const testCase of this.gtestWorkspace.matchingTestCases(
      this.request
    )) {
      const packageInfo = await packages.fromFilepath(testCase.uri.fsPath);
      if (!packageInfo) {
        this.output.append(
          `Skip ${testCase.suiteAndCaseName}: found no package info for ${testCase.uri.fsPath}\n`
        );
        this.testRun.skipped(testCase.item);
        continue;
      }
      this.testRun.enqueued(testCase.item);

      const qpn = getQualifiedPackageName(packageInfo.pkg);
      const tests = packageToTests.get(qpn);
      if (tests) {
        tests.push(testCase);
      } else {
        packageToTests.set(qpn, [testCase]);
      }
    }

    return packageToTests;
  }

  private createEbuild(packageName: string): ebuild.Ebuild {
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
    return new ebuild.Ebuild(
      this.board,
      packageName,
      this.output,
      this.chrootService.crosFs,
      ['compilation_database', 'test'],
      this.cancellation
    );
  }

  /**
   * Compiles the tests for the package, and returns the build directory (base
   * directory such as the path to chroot and the path to the directory from the
   * base directory), under which gtest executables are located.
   */
  private async compileOrThrow(
    ebuildInstance: ebuild.Ebuild
  ): Promise<BuildDirectory> {
    // generate() throws on failure.
    const compilationDatabase = await ebuildInstance.generate();
    if (!compilationDatabase) {
      throw new Error(
        `failed to compile ${ebuildInstance.qualifiedPackageName}`
      );
    }
    return {
      baseDir: compilationDatabase.baseDir,
      buildDir: path.dirname(compilationDatabase.path),
    };
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
  private async collectGtests({
    baseDir,
    buildDir,
  }: BuildDirectory): Promise<GTestInfo[]> {
    // We consider an executable a gtest if it contains one of the following markers.
    const gtestMarker = new Set(['usr/include/gtest/gtest.h', 'libgtest.so']);

    const results: GTestInfo[] = [];

    // Parallelize time consuming operations.
    const listTestsOperations: Promise<void>[] = [];

    const absoluteBuildDir = path.join(baseDir, buildDir);

    for (const fileName of await fs.promises.readdir(absoluteBuildDir)) {
      if (this.cancellation.isCancellationRequested) {
        return [];
      }
      const fileInChroot = path.join(buildDir, fileName);
      const fileOutsideChroot = path.join(absoluteBuildDir, fileName);

      try {
        const stat = await fs.promises.stat(fileOutsideChroot);
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

  private async listTests(
    gtestInChroot: string
  ): Promise<gtestTestListParser.TestNameCollection | Error> {
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
    return gtestTestListParser.parse(result.stdout);
  }

  private async runTestOrThrow(
    executableInChroot: string,
    test: GtestCase,
    workingDir: string
  ) {
    const memoryOutput = new MemoryOutputChannel();
    const result = await this.chrootService.exec(
      PLATFORM2_TEST_PY,
      [
        `--board=${this.board}`,
        executableInChroot,
        '--',
        `--gtest_filter=${test.getGtestFilter()}`,
      ],
      {
        sudoReason: 'to run test',
        cancellationToken: this.cancellation,
        logger: new TeeOutputChannel(this.output, memoryOutput),
        logStdout: true,
        crosSdkWorkingDir: workingDir,
      }
    );
    if (result instanceof Error) {
      this.output.appendLine(result.message);
      // TODO(oka): Strip ANSI coloring from the message. The logger supports
      // ANSI coloring, but the TestMessage doesn't.
      throw new Error(memoryOutput.output);
    }
  }

  private async debugTestOrThrow(
    gtestInfo: GTestInfo,
    test: GtestCase,
    workingDir: string
  ) {
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
        `gdbserver :${port} ${pathInSysroot} --gtest_filter=${test.getGtestFilter()}`,
      ],
      {
        sudoReason: 'to run test under gdbserver',
        logger: this.output,
        logStdout: true,
        cancellationToken: this.cancellation,
        crosSdkWorkingDir: workingDir,
      }
    );

    // Sysroot may exist in the `out` directory outside chroot: b/296984596.
    const rootOutsideChroot = fs.existsSync(
      path.join(this.chrootService.chroot.root, sysroot)
    )
      ? this.chrootService.chroot.root
      : this.chrootService.out.root;

    const pathSubstitutions: {[pathInChroot: string]: string} = {
      '/': rootOutsideChroot,
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
      `ChromiumIDE running debugger with the following config: ${JSON.stringify(
        debugConfiguration
      )}`
    );

    await vscode.debug.startDebugging(undefined, debugConfiguration);

    await ongoingTest;
  }
}

type GTestInfo = {
  // Name of tests the executable contains.
  testNames: gtestTestListParser.TestNameCollection;
  // Path to the executable in chroot.
  executable: string;
  // Possible platform2 directories relative to the executable.
  platform2Dirs: string[];
};
