// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Script to manage installation of the extension.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as commonUtil from '../common/common_util';

function assertInsideChroot() {
  if (!commonUtil.isInsideChroot()) {
    throw new Error('not inside chroot');
  }
}

const GS_PREFIX = 'gs://chromeos-velocity/ide/cros-ide';

async function execute(name: string, args: string[], showStdout?: boolean): Promise<string> {
  const res = await commonUtil.exec(
      name, args, log => process.stderr.write(log), {logStdout: showStdout});
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
export async function findArchive(version?: Version): Promise<Archive> {
  // The result of `gsutil ls` is lexicographically sorted.
  const stdout = await execute('gsutil', ['ls', GS_PREFIX]);
  const archives = stdout.trim().split('\n').map(url => {
    return Archive.parse(url);
  });
  archives.sort(Archive.compareFn);
  if (!version) {
    return archives.pop()!;
  }
  for (const archive of archives) {
    if (compareVersion(archive.version, version) === 0) {
      return archive;
    }
  }
  throw new Error(`Version ${versionToString(version)} not found`);
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
  const diff = await execute('git',
      ['diff', '-p', 'HEAD~', '--', '**package.json']);
  if (!/^\+\s*"version"\s*:/m.test(diff)) {
    throw new Error('HEAD commit should update version in package.json');
  }
  return await execute('git', ['rev-parse', 'HEAD']);
}

class Archive {
  readonly version: Version;
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
    return compareVersion(first.version, second.version);
  }
}

export interface Version {
  major: number
  minor: number
  patch: number
}

export function compareVersion(first: Version, second: Version): number {
  if (first.major !== second.major) {
    return first.major - second.major;
  }
  if (first.minor !== second.minor) {
    return first.minor - second.minor;
  }
  if (first.patch !== second.patch) {
    return first.patch - second.patch;
  }
  return 0;
}

// Get version from filename such as "cros-ide-0.0.1.vsix"
function versionFromFilename(name: string): Version {
  const suffix = name.split('-').pop()!;
  const version = suffix.split('.').slice(0, 3).join('.');
  return versionFromString(version);
}

/**
 * Get version from string such as "0.0.1".
 * @throws Error on invalid input.
 */
export function versionFromString(s: string): Version {
  const version = s.trim().split('.').map(Number);
  if (version.length !== 3 || version.some(isNaN)) {
    throw new Error(`Invalid version format ${s}`);
  }
  return {
    major: version[0],
    minor: version[1],
    patch: version[2],
  };
}

export function versionToString(v: Version): string {
  return `${v.major}.${v.minor}.${v.patch}`;
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
    if (compareVersion(latestInGs.version, built.version) >= 0) {
      throw new Error(
          `${built.name} is older than the latest published version ` +
        `${latestInGs.name}. Update the version and rerun the program.`);
    }
    await execute('gsutil', ['cp', path.join(td, built.name), built.url()]);
  });
}

export async function installDev(exe: string) {
  await commonUtil.withTempDir(async td => {
    const built = await build(td);
    const src = path.join(td, built.name);
    await execute(exe, ['--force', '--install-extension', src], true);
  });
}

export async function install(exe: string, forceVersion?: Version) {
  const src = await findArchive(forceVersion);

  await commonUtil.withTempDir(async td => {
    const dst = path.join(td, src.name);

    await execute('gsutil', ['cp', src.url(), dst]);
    const args = ['--install-extension', dst];
    if (forceVersion) {
      args.push('--force');
    }

    await execute(exe, args, true);
  });
}

interface Config {
  forceVersion?: Version
  dev?: boolean
  upload?: boolean
  exe: string
  help?: boolean
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
      case '--force':
        const s = args.shift();
        if (!s) {
          throw new Error('Version is not given; see --help');
        }
        config.forceVersion = versionFromString(s);
        break;
      case '--exe':
        const exe = args.shift();
        if (!exe) {
          throw new Error('Executable path is not given; see --help');
        }
        config.exe = exe;
        break;
      case '--help':
        config.help = true;
        break;
      default:
        throw new Error(`Unknown flag ${flag}; see --help`);
    }
  }
  if (config.dev && config.upload || config.dev && config.forceVersion ||
    config.upload && config.forceVersion) {
    throw new Error(`Invalid flag combination; see --help`);
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
  if (config.dev) {
    assertInsideChroot();
    await installDev(config.exe);
    return;
  }
  try {
    assertInsideChroot();
    await install(config.exe, config.forceVersion);
  } catch (e) {
    const message = (e as Error).message;
    throw new Error(
        `${message}\n` +
      'Read quickstart.md and run the script in proper environment');
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
