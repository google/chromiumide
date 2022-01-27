// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Script to manage installation of the extension.
 */

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';
import * as commonUtil from '../common/common_util';

function assertInsideChroot() {
  if (!commonUtil.isInsideChroot()) {
    throw new Error('not inside chroot');
  }
}

const GS_PREFIX = 'gs://chromeos-velocity/ide/cros-ide';

async function execute(cmd: string, showStdout?: boolean) {
  const {stdout, stderr} = await util.promisify(childProcess.exec)(cmd);
  process.stderr.write(stderr);
  if (showStdout) {
    process.stdout.write(stdout);
  }
  return stdout;
}

async function latestArchive() {
  // The result of `gsutil ls` is lexicographically sorted.
  const stdout = await execute(`gsutil ls ${GS_PREFIX}`);
  const archives = stdout.trim().split('\n').map(url => {
    return Archive.parse(url);
  });
  archives.sort(Archive.compareFn);
  return archives.pop()!;
}

async function gitIsDirty() {
  const stdout = await execute(`git diff --stat`);
  return stdout !== '';
}

// Assert the working directory is clean and get git commit hash.
async function cleanCommitHash() {
  if (await gitIsDirty()) {
    throw new Error('dirty git status; run the command in clean environment');
  }
  const wantHash = await execute('git rev-parse cros/main');
  const hash = await execute('git rev-parse HEAD');

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

// TODO(oka): test this function.
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
// TODO(oka): test this function.
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

async function buildAndUpload() {
  const latestInGs = await latestArchive();
  const hash = await cleanCommitHash();
  let td: string | undefined;
  try {
    td = await fs.promises.mkdtemp(os.tmpdir() + '/');
    await execute(`npx vsce@1.103.1 package -o ${td}/`);
    const localName = (await fs.promises.readdir(td))[0];
    const localVersion = versionFromFilename(localName);
    if (compareVersion(latestInGs.version, localVersion) >= 0) {
      throw new Error(
          `${localName} is older than the latest published version ` +
          `${latestInGs.name}. Update the version and rerun the program.`);
    }
    const url = new Archive(localName, hash).url();
    // TODO(oka): use execFile.
    await execute(`gsutil cp ${td}/${localName} ${url}`);
  } finally {
    if (td) {
      await fs.promises.rmdir(td, {recursive: true});
    }
  }
}

async function install() {
  assertInsideChroot();

  const src = await latestArchive();
  let td: string | undefined;
  try {
    td = await fs.promises.mkdtemp(os.tmpdir() + '/');
    const dst = path.join(td, src.name);

    await execute(`gsutil cp ${src} ${dst}`);
    await execute(`code --install-extension ${dst}`, true);
  } finally {
    if (td) {
      await fs.promises.rmdir(td, {recursive: true});
    }
  }
}

async function main() {
  const upload = process.argv.includes('--upload');
  if (upload) {
    await buildAndUpload();
    return;
  }
  try {
    await install();
  } catch (e) {
    const message = (e as Error).message;
    throw new Error(
        `${message}\n` +
        'Read quickstart.md and run the script in proper environment');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
