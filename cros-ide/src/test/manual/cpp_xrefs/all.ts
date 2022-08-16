// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';
import * as commander from 'commander';
import * as glob from 'glob';
import * as cppPackages from '../../../features/cpp_code_completion/packages';
import * as testing from '../../testing';
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
  'camera/features/auto_framing',
  'camera/features',
  'camera/features/face_detection',
  'camera/features/gcam_ae',
  'camera/features/hdrnet',
  'camera/features/zsl',
  'camera/gpu',
  'camera/gpu/egl',
  'camera/gpu/gles',
  'common-mk/testrunner',
  'media_capabilities',
]);

type Options = {
  compdbGen: boolean;
  jobs: number;
  cutoff: number;
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
  private errors: Error[] = []; // updated when error occurs.
  constructor(
    private readonly packageInfo: cppPackages.PackageInfo,
    readonly output: vscode.OutputChannel
  ) {}

  getErrors() {
    return this.errors.slice();
  }

  getPackageInfo() {
    return Object.assign({}, this.packageInfo);
  }

  /**
   * Returns a job to generate compilation database.
   */
  generateCompdb(): Job<void> {
    return async () => {
      try {
        await compdb.generate(this.packageInfo, this.output);
      } catch (e) {
        this.errors.push(e as Error);
      }
    };
  }

  /**
   * Returns jobs that collectively call clangd for all the C++ files with
   * the number of lines less than cutoff, updating the instance fields on
   * encountering errors.
   */
  async callClangdForAllCpp(cutoff: number): Promise<Job<void>[]> {
    if (this.errors.length) {
      return [];
    }
    const source = chrootServiceInstance().source()!.root;
    const allCppFiles = await util.promisify(glob.glob)(
      path.join(source, this.packageInfo.sourceDir, '**/*.{cc,cpp}')
    );
    const jobs = [];
    for (const cppFile of allCppFiles) {
      jobs.push(async () => {
        const content = await fs.promises.readFile(cppFile, 'utf8');
        if ((content.match(/\n/g) ?? []).length > cutoff) {
          return;
        }
        const checkResult = await clangd.check(cppFile, this.output);
        if (checkResult.notFoundHeaders) {
          for (const header of checkResult.notFoundHeaders) {
            this.errors.push(
              new Error(`${cppFile} pp_file_not_found ${header}`)
            );
          }
        }
      });
    }
    return jobs;
  }

  dumpErrors() {
    this.output.appendLine('========== ERRORS ==========');
    for (const error of this.errors) {
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
      await this.generateCompdbs(jobsProviders);
    }
    await this.runClangds(jobsProviders);
    this.reportAndThrowOnFailures(jobsProviders);
  }

  private async createJobsProviders(): Promise<PackageJobsProvider[]> {
    const chrootService = chrootServiceInstance();

    const platform2 = path.join(chrootService.source()!.root, 'src/platform2');
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
      if (seenAtoms.has(packageInfo.atom)) {
        continue;
      }
      seenAtoms.add(packageInfo.atom);

      const output = await this.packageOutputChannel(packageInfo);

      jobsProviders.push(new PackageJobsProvider(packageInfo, output));
    }
    return jobsProviders;
  }

  private async generateCompdbs(jobsProviders: PackageJobsProvider[]) {
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

      compdbJobs.push(jobsProvider.generateCompdb());
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
    const failedJobProviders = new Array<[number, PackageJobsProvider]>();
    for (const jobsProvider of jobsProviders) {
      const errors = jobsProvider.getErrors();
      if (errors.length === 0) {
        continue;
      }
      failedJobProviders.push([errors.length, jobsProvider]);
    }
    failedJobProviders.sort((a, b) => b[0] - a[0]); // descending order

    const failureReports = [];
    for (const [errorCount, jobsProvider] of failedJobProviders) {
      jobsProvider.dumpErrors();

      const sourceDir = jobsProvider.getPackageInfo().sourceDir;
      const logFile = jobsProvider.output.name;
      failureReports.push(`${sourceDir} (${errorCount} errors): ${logFile}`);
    }
    if (failureReports.length) {
      throw new Error(
        `Failed on the following packages:\n${failureReports.join('\n')}`
      );
    }
  }

  private async packageOutputChannel(
    packageInfo: cppPackages.PackageInfo
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
