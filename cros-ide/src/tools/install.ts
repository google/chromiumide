// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Script to manage installation of the extension.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import * as commonUtil from '../common/common_util';

function assertInsideChroot() {
  if (!commonUtil.isInsideChroot()) {
    throw new Error('not inside chroot');
  }
}

function assertOutsideChroot() {
  if (commonUtil.isInsideChroot()) {
    throw new Error('installation outside chroot is required');
  }
}

const GSUTIL = '../../scripts/gsutil';
const GS_PREFIX = 'gs://chromeos-velocity/ide/cros-ide';

async function execute(
  name: string,
  args: string[],
  showStdout?: boolean
): Promise<string> {
  const res = await commonUtil.exec(name, args, {
    logger: new (class {
      append(s: string): void {
        process.stderr.write(s);
      }
    })(),
    logStdout: showStdout,
  });
  if (res instanceof Error) {
    throw res;
  }
  return res.stdout;
}

/**
 * Find specified archive, or the latest one if version is unspecified.
 *
 * @throws Error if specified version is not found.
 */
export async function findArchive(
  version?: semver.SemVer,
  gsutil = GSUTIL
): Promise<Archive> {
  // The result of `gsutil ls` is lexicographically sorted.
  const stdout = await execute(gsutil, ['ls', GS_PREFIX]);
  const archives = stdout
    .trim()
    .split('\n')
    .map(url => {
      return Archive.parse(url);
    });
  archives.sort(Archive.compareFn);
  if (!version) {
    return archives.pop()!;
  }
  for (const archive of archives) {
    if (archive.version.compare(version) === 0) {
      return archive;
    }
  }
  throw new Error(`Version ${version} not found`);
}

// Assert the working directory is clean and get git commit hash.
async function cleanCommitHash() {
  if (await execute('git', ['status', '--short'])) {
    throw new Error('dirty git status; run the command in clean environment');
  }
  // IDE_CROS_MAIN_FOR_TESTING substitutes cros/main for manual testing.
  const crosMain = process.env.IDE_CROS_MAIN_FOR_TESTING || 'cros/main';
  try {
    // Assert HEAD is an ancestor of cros/main (i.e. the HEAD is an
    // already-merged commit).
    await execute('git', ['merge-base', '--is-ancestor', 'HEAD', crosMain]);
  } catch (_e) {
    throw new Error('HEAD should be an ancestor of cros/main');
  }
  // HEAD commit should update version in package.json .
  const diff = await execute('git', [
    'diff',
    '-p',
    'HEAD~',
    '--',
    '**package.json',
  ]);
  if (!/^\+\s*"version"\s*:/m.test(diff)) {
    throw new Error('HEAD commit should update version in package.json');
  }
  return await execute('git', ['rev-parse', 'HEAD']);
}

class Archive {
  readonly version: semver.SemVer;
  constructor(readonly name: string, readonly hash?: string) {
    this.version = versionFromFilename(name);
  }

  url() {
    let res = `${GS_PREFIX}/${this.name}`;
    if (this.hash !== undefined) {
      res = `${res}@${this.hash}`;
    }
    return res;
  }

  static parse(url: string) {
    const base = path.basename(url);
    const [name, hash] = base.split('@');
    return new Archive(name, hash);
  }

  static compareFn(first: Archive, second: Archive): number {
    return first.version.compare(second.version);
  }
}

// Matches the version suffix of a file name.
const VERSION_SUFFIX_RE = /-(\d.*)\.[^.]+/;

// Get version from filename such as "cros-ide-0.0.1.vsix"
function versionFromFilename(name: string): semver.SemVer {
  const match = VERSION_SUFFIX_RE.exec(name);
  if (!match) {
    throw new Error(`Version suffix not found: ${name}`);
  }
  return new semver.SemVer(match[1]);
}

async function bumpDevVersion(): Promise<void> {
  await execute('npm', ['version', 'prerelease', '--preid=dev']);
}

async function build(tempDir: string, hash?: string): Promise<Archive> {
  await execute('npx', ['vsce@1.103.1', 'package', '-o', `${tempDir}/`]);
  const localName: string = (await fs.promises.readdir(tempDir))[0];
  return new Archive(localName, hash);
}

export async function buildAndUpload() {
  const latestInGs = await findArchive();
  const hash = await cleanCommitHash();

  await commonUtil.withTempDir(async td => {
    const built = await build(td, hash);
    if (latestInGs.version.compare(built.version) >= 0) {
      throw new Error(
        `${built.name} is older than the latest published version ` +
          `${latestInGs.name}. Update the version and rerun the program.`
      );
    }
    await execute(GSUTIL, ['cp', path.join(td, built.name), built.url()]);
  });
}

export async function installDev(exe: string) {
  await commonUtil.withTempDir(async td => {
    await bumpDevVersion();
    const built = await build(td);
    const src = path.join(td, built.name);
    await execute(exe, ['--force', '--install-extension', src], true);
  });
}

/**
 * Install CrOS IDE extension.
 *
 * @param exe Path to the VSCode executable
 * @param forceVersion Optional parameter specifying the version to install
 *
 * @throws Error if install fails
 */
export async function install(
  exe: string,
  forceVersion?: semver.SemVer,
  gsutil: string = GSUTIL
) {
  const src = await findArchive(forceVersion, gsutil);

  if (src.version.compare('0.0.10') <= 0) {
    assertInsideChroot();
  } else {
    assertOutsideChroot();
  }

  await commonUtil.withTempDir(async td => {
    const dst = path.join(td, src.name);

    await execute(gsutil, ['cp', src.url(), dst]);
    const args = ['--install-extension', dst];
    if (forceVersion) {
      args.push('--force');
    }

    await execute(exe, args, true);
  });
}

interface Config {
  forceVersion?: semver.SemVer;
  dev?: boolean;
  upload?: boolean;
  exe: string;
  help?: boolean;
}

/**
 * Parse args.
 *
 * @throws Error on invalid input
 */
export function parseArgs(args: string[]): Config {
  args = args.slice(); // not to modify the given parameter
  while (args.length > 0 && !args[0].startsWith('--')) {
    args.shift();
  }

  const config: Config = {
    exe: 'code',
  };
  while (args.length > 0) {
    const flag = args.shift();
    switch (flag) {
      case '--dev':
        config.dev = true;
        break;
      case '--upload':
        config.upload = true;
        break;
      case '--force': {
        const s = args.shift();
        if (!s) {
          throw new Error('Version is not given; see --help');
        }
        config.forceVersion = new semver.SemVer(s);
        break;
      }
      case '--exe': {
        const exe = args.shift();
        if (!exe) {
          throw new Error('Executable path is not given; see --help');
        }
        config.exe = exe;
        break;
      }
      case '--help':
        config.help = true;
        break;
      default:
        throw new Error(`Unknown flag ${flag}; see --help`);
    }
  }
  if (
    (config.dev && config.upload) ||
    (config.dev && config.forceVersion) ||
    (config.upload && config.forceVersion)
  ) {
    throw new Error('Invalid flag combination; see --help');
  }
  return config;
}

const USAGE = `
Usage:
 install.sh [options]

Basic options:

 --exe path|name
    Specify the VS Code executable. By default 'code' is used. You need to set this flag
    if you are using code-server or code-insiders

 --force version
    Force install specified version (example: --force 0.0.1)
    Without this option, the latest version will be installed.

 --help
    Print this message

Developer options:

 --dev
    Build the extension from the current source code and install it

 --upload
    Build and upload the extension
`;

async function main() {
  const config = parseArgs(process.argv);
  if (config.help) {
    console.log(USAGE);
    return;
  }
  if (config.upload) {
    await buildAndUpload();
    return;
  }

  if ((await commonUtil.exec('which', [config.exe])) instanceof Error) {
    throw new Error('VSCode executable not found. Did you forget `--exe`?');
  }
  if (config.dev) {
    await installDev(config.exe);
    return;
  }
  try {
    await install(config.exe, config.forceVersion);
  } catch (e) {
    const message = (e as Error).message;
    throw new Error(
      `${message}\n` +
        'Read http://go/cros-ide-quickstart and run the script in proper environment'
    );
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
}
