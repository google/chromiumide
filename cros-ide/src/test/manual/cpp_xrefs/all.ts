// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';
import * as commander from 'commander';
import * as glob from 'glob';
import * as services from '../../../services';
import * as testing from '../../testing';
import {CompilationDatabase} from '../../../features/chromiumos/cpp_code_completion/compdb_service/compilation_database_type';
import * as clangd from './clangd';
import * as compdb from './compdb';
import {chrootServiceInstance, packagesInstance} from './common';

const SKIP_PACKAGES = new Set([
  // TODO(oka): Following packages don't compile on betty because of unmet requirements.
  // Use different boards to compile these packages.
  'chromeos-base/minios',
  'chromeos-base/sommelier',
  // Following packages aren't actively developed and don't compile.
  'chromeos-base/diagnostics-test',
  'chromeos-base/ocr',
  'media-libs/cros-camera-libjda_test',
]);

const SKIP_BUILD_GN = new Set([
  // There are no ebuild files compiling BUILD.gn under these directories.
  'camera/features',
  'camera/features/auto_framing',
  'camera/features/face_detection',
  'camera/features/gcam_ae',
  'camera/features/hdrnet',
  'camera/features/zsl',
  'camera/gpu',
  'camera/gpu/egl',
  'camera/gpu/gles',
  'camera/hal/fake',
  'common-mk/testrunner',
  'media_capabilities',
]);

type Options = {
  compdbGen: boolean;
  jobs: number;
  cutoff: number;
  board: string;
  // If empty, check all the packages.
  package: string[];
};

export function installCommand(program: commander.Command) {
  program
    .command('all')
    .description(
      'run all the tests from creating compilation databases to running clangd for all the C++ files'
    )
    .option('--no-compdb-gen', 'skip generation of compilation database')
    .addOption(
      new commander.Option(
        '-j, --jobs <number>',
        'number of jobs to run in parallel'
      ).default(os.cpus().length)
    )
    .addOption(
      // Skip large files because clangd CLI becomes significantly slower as
      // the size of the file increases, though this problem doesn't happen on
      // the editor.
      // Less than 1% of the C++ files are skipped with the default setting.
      new commander.Option(
        '--cutoff <number>',
        'skip C++ files with the number of lines more than this value'
      ).default(2000)
    )
    .addOption(
      new commander.Option('--board <string>', 'the board to use').default(
        'betty'
      )
    )
    .addOption(
      new commander.Option(
        '--package <strings...>',
        'package(s) to check'
      ).default([])
    )
    .action(async opt => {
      await main(opt);
    });
}

async function main(options: Options) {
  const tempDirBase = '/tmp/cpp_xrefs_check';
  await fs.promises.mkdir(tempDirBase, {recursive: true});
  const logDir = await fs.promises.mkdtemp(path.join(tempDirBase, 'out'));
  const latestLogDir = path.join(tempDirBase, 'latest');
  await fs.promises.unlink(latestLogDir);
  await fs.promises.symlink(logDir, latestLogDir);

  const logger = await FileOutputChannel.create(
    path.join(logDir, 'output.txt'),
    true
  );
  logger.appendLine(`Log directory: ${logDir}`);
  try {
    const tester = new Tester(logDir, logger, options);
    await tester.testPlatform2Packages();
    fs.rmdirSync(logDir, {recursive: true});
  } catch (e) {
    logger.appendLine((e as Error).message);
  }
}

type Job<T> = () => Promise<T>;

class PackageJobsProvider {
  private generateCompdbError: Error | undefined = undefined;
  private readonly clangdErrors: Error[] = []; // updated when error occurs.
  constructor(
    private readonly packageInfo: services.chromiumos.PackageInfo,
    readonly output: vscode.OutputChannel
  ) {}

  getGenerateCompdbError() {
    return this.generateCompdbError;
  }

  getClangdErrors() {
    return this.clangdErrors.slice();
  }

  getPackageInfo() {
    return Object.assign({}, this.packageInfo);
  }

  /**
   * Returns a job to generate compilation database.
   */
  generateCompdb(board: string): Job<void> {
    return async () => {
      try {
        await compdb.generate(this.packageInfo, this.output, board);
      } catch (e) {
        this.generateCompdbError = e as Error;
      }
    };
  }

  /**
   * Returns jobs that collectively call clangd for all the C++ files listed in
   * compilation database, updating the instance fields on encountering errors.
   */
  async callClangdForAllCpp(cutoff: number): Promise<Job<void>[]> {
    if (this.generateCompdbError) {
      return [];
    }
    const sourceDir = path.join(
      chrootServiceInstance().source.root,
      this.packageInfo.sourceDir
    );
    const compdbPath = path.join(sourceDir, 'compile_commands.json');
    const compdbContent = JSON.parse(
      await fs.promises.readFile(compdbPath, 'utf-8')
    ) as CompilationDatabase;

    const jobs = [];
    for (const entry of compdbContent) {
      if (!entry.file.startsWith(sourceDir)) {
        continue;
      }
      jobs.push(async () => {
        const content = await fs.promises.readFile(entry.file, 'utf8');
        if ((content.match(/\n/g) ?? []).length > cutoff) {
          return;
        }
        const checkResult = await clangd.check(entry.file, this.output);
        if (checkResult.notFoundHeaders) {
          for (const header of checkResult.notFoundHeaders) {
            this.clangdErrors.push(
              new Error(`${entry.file} pp_file_not_found ${header}`)
            );
          }
        }
      });
    }
    return jobs;
  }

  dumpErrors() {
    this.output.appendLine('========== ERRORS ==========');
    for (const error of this.clangdErrors) {
      this.output.appendLine(error.message);
    }
  }
}

class Tester {
  constructor(
    private readonly logDir: string,
    private readonly output: vscode.OutputChannel,
    private readonly options: Options
  ) {}

  async testPlatform2Packages() {
    const jobsProviders = await this.createJobsProviders();
    if (this.options.compdbGen) {
      await this.generateCompdbs(jobsProviders, this.options.board);
    }
    await this.runClangds(jobsProviders);
    this.reportAndThrowOnFailures(jobsProviders);
  }

  private async createJobsProviders(): Promise<PackageJobsProvider[]> {
    const chrootService = chrootServiceInstance();

    const platform2 = path.join(chrootService.source.root, 'src/platform2');
    const allBuildGn = await util.promisify(glob.glob)(
      `${platform2}/**/BUILD.gn`
    );
    const cppBuildGn = [];
    for (const buildGn of allBuildGn) {
      const platformSubdir = path.dirname(
        buildGn.substring(`${platform2}/`.length)
      );
      if (SKIP_BUILD_GN.has(platformSubdir)) {
        continue;
      }
      const buildGnContent = await fs.promises.readFile(buildGn, 'utf8');
      if (/\.(cc|cpp)\b/.test(buildGnContent)) {
        cppBuildGn.push(buildGn);
      }
    }
    {
      // Ensure succeeding operations runs without password.
      const result = await chrootService.exec('true', [], {
        sudoReason: 'to run test',
      });
      if (result instanceof Error) {
        throw result;
      }
    }

    const jobsProviders = [];
    const seenAtoms = new Set();
    for (const buildGn of cppBuildGn) {
      const packageInfo = await packagesInstance().fromFilepath(buildGn);
      if (!packageInfo) {
        throw new Error(`Failed to get package info from ${buildGn}`);
      }
      if (SKIP_PACKAGES.has(packageInfo.atom)) {
        continue;
      }
      if (
        this.options.package.length &&
        !this.options.package.includes(packageInfo.atom)
      ) {
        continue;
      }
      if (seenAtoms.has(packageInfo.atom)) {
        continue;
      }
      seenAtoms.add(packageInfo.atom);

      const output = await this.packageOutputChannel(packageInfo);

      jobsProviders.push(new PackageJobsProvider(packageInfo, output));
    }
    return jobsProviders;
  }

  private async generateCompdbs(
    jobsProviders: PackageJobsProvider[],
    board: string
  ) {
    const compdbJobs = [];
    for (const [i, jobsProvider] of jobsProviders.entries()) {
      // Add a fake job for logging.
      const sourceDir = jobsProvider.getPackageInfo().sourceDir;
      const n = jobsProviders.length;
      compdbJobs.push(async () => {
        this.output.appendLine(
          `${sourceDir} (${i + 1}/${n}): generating compdb`
        );
      });

      compdbJobs.push(jobsProvider.generateCompdb(board));
    }
    await new testing.ThrottledJobRunner(
      compdbJobs,
      this.options.jobs
    ).allSettled();
  }

  private async runClangds(jobsProviders: PackageJobsProvider[]) {
    const clangdJobs = [];
    for (const [i, jobsProvider] of jobsProviders.entries()) {
      const jobs = await jobsProvider.callClangdForAllCpp(this.options.cutoff);

      // Add a fake job for logging.
      const sourceDir = jobsProvider.getPackageInfo().sourceDir;
      const [n, m] = [jobsProviders.length, jobs.length];
      clangdJobs.push(async () => {
        this.output.appendLine(
          `${sourceDir} (${i + 1}/${n}): running clangd against ${m} C++ files`
        );
      });

      for (const job of jobs) {
        clangdJobs.push(job);
      }
    }
    await new testing.ThrottledJobRunner(
      clangdJobs,
      this.options.jobs
    ).allSettled();
  }

  private reportAndThrowOnFailures(jobsProviders: PackageJobsProvider[]) {
    const failureReports = [];

    const compiledJobs = [];
    for (const job of jobsProviders) {
      if (!job.getGenerateCompdbError()) {
        compiledJobs.push(job);
        continue;
      }
      job.dumpErrors();
      const sourceDir = job.getPackageInfo().sourceDir;
      const logFile = job.output.name;
      failureReports.push(`${sourceDir} (compile error): ${logFile}`);
    }

    const clangdFailedJobs: [number, PackageJobsProvider][] = [];
    for (const job of compiledJobs) {
      const errors = job.getClangdErrors();
      if (errors.length === 0) {
        continue;
      }
      clangdFailedJobs.push([errors.length, job]);
    }
    clangdFailedJobs.sort((a, b) => b[0] - a[0]); // descending order

    for (const [errorCount, job] of clangdFailedJobs) {
      job.dumpErrors();

      const sourceDir = job.getPackageInfo().sourceDir;
      const logFile = job.output.name;
      failureReports.push(`${sourceDir} (${errorCount} errors): ${logFile}`);
    }
    if (failureReports.length) {
      throw new Error(
        `Failed on the following packages:\n${failureReports.join('\n')}`
      );
    }
  }

  private async packageOutputChannel(
    packageInfo: services.chromiumos.PackageInfo
  ): Promise<vscode.OutputChannel> {
    return await FileOutputChannel.create(
      path.join(this.logDir, packageInfo.atom, 'output.txt'),
      false
    );
  }
}

/**
 * An OutputChannel that sends logs to the given WriteStream and optionally
 * to the stdout as well.
 * It outputs timestamp at the beginning of a log line.
 */
class FileOutputChannel implements vscode.OutputChannel {
  private afterNewline = true;
  constructor(
    readonly name: string,
    readonly output: fs.WriteStream,
    private readonly stdout: boolean
  ) {}

  static async create(
    filepath: string,
    stdout: boolean
  ): Promise<vscode.OutputChannel> {
    await fs.promises.mkdir(path.dirname(filepath), {recursive: true});
    const stream = fs.createWriteStream(filepath);
    return new FileOutputChannel(filepath, stream, stdout);
  }

  append(value: string): void {
    const s =
      (this.afterNewline ? new Date().toISOString() + ': ' : '') + value;
    if (this.stdout) {
      process.stdout.write(s);
    }
    this.output.write(s);
    this.afterNewline = value.endsWith('\n');
  }

  appendLine(value: string): void {
    this.append(value + '\n');
    this.afterNewline = true;
  }

  replace(): void {}
  clear(): void {}
  show(): void {}
  hide(): void {}
  dispose(): void {}
}
