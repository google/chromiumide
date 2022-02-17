// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Script to manage installation of the extension.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as commonUtil from '../common/common_util';

function assertInsideChroot() {
  if (!commonUtil.isInsideChroot()) {
    throw new Error('not inside chroot');
  }
}

let exec = commonUtil.exec;

export function setExecForTesting(
    fakeExec: (name: string, args: string[]) => Promise<string>): () => void {
  const original = exec;
  exec = fakeExec;
  return () => {
    exec = original;
  };
}

const GS_PREFIX = 'gs://chromeos-velocity/ide/cros-ide';

async function execute(name: string, args: string[], showStdout?: boolean) {
  return await exec(
      name, args, log => process.stderr.write(log), {logStdout: showStdout});
}

async function latestArchive(): Promise<Archive> {
  // The result of `gsutil ls` is lexicographically sorted.
  const stdout = await execute('gsutil', ['ls', GS_PREFIX]);
  const archives = stdout.trim().split('\n').map(url => {
    return Archive.parse(url);
  });
  archives.sort(Archive.compareFn);
  return archives.pop()!;
}

async function gitIsDirty() {
  const stdout = await execute('git', ['diff', '--stat']);
  return stdout !== '';
}

// Assert the working directory is clean and get git commit hash.
async function cleanCommitHash() {
  if (await gitIsDirty()) {
    throw new Error('dirty git status; run the command in clean environment');
  }
  const wantHash = await execute('git', ['rev-parse', 'cros/main']);
  const hash = await execute('git', ['rev-parse', 'HEAD']);

  if (process.env.IDE_IGNORE_CROS_MAIN_FOR_TESTING) {
    // Skip check for manual testing of the script.
  } else {
    if (hash !== wantHash) {
      throw new Error('HEAD must be cros/main');
    }
  }
  return hash;
}

class Archive {
  readonly version: Version;
  constructor(readonly name: string, readonly hash: string) {
    this.version = versionFromFilename(name);
  }

  url() {
    return `${GS_PREFIX}/${this.name}@${this.hash}`;
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

interface Version {
  major: number
  minor: number
  patch: number
}

function compareVersion(first: Version, second: Version): number {
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
// TODO(oka): check invalid input.
function versionFromFilename(name: string): Version {
  const suffix = name.split('-').pop()!;
  const version = suffix.split('.').slice(0, 3).map(Number);
  return {
    major: version[0],
    minor: version[1],
    patch: version[2],
  };
}

async function build(tempDir: string, hash: string): Promise<Archive> {
  await execute('npx', ['vsce@1.103.1', 'package', '-o', `${tempDir}/`]);
  const localName: string = (await fs.promises.readdir(tempDir))[0];
  return new Archive(localName, hash);
}

async function withTempDir(
    f: (tempDir: string) => Promise<void>): Promise<void> {
  let td: string | undefined;
  try {
    td = await fs.promises.mkdtemp(os.tmpdir() + '/');
    await f(td);
  } finally {
    if (td) {
      await fs.promises.rmdir(td, {recursive: true});
    }
  }
}

export async function buildAndUpload() {
  const latestInGs = await latestArchive();
  const hash = await cleanCommitHash();

  await withTempDir(async td => {
    const built = await build(td, hash);
    if (compareVersion(latestInGs.version, built.version) >= 0) {
      throw new Error(
          `${built.name} is older than the latest published version ` +
        `${latestInGs.name}. Update the version and rerun the program.`);
    }
    await execute('gsutil', ['cp', path.join(td, built.name), built.url()]);
  });
}

export async function install() {
  const src = await latestArchive();

  await withTempDir(async td => {
    const dst = path.join(td, src.name);

    await execute('gsutil', ['cp', src.url(), dst]);
    await execute('code', ['--install-extension', dst], true);
  });
}

async function main() {
  const upload = process.argv.includes('--upload');
  if (upload) {
    await buildAndUpload();
    return;
  }
  try {
    assertInsideChroot();
    await install();
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
