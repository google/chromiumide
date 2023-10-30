// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import {Chroot} from '../../common/common_util';
import {cleanState} from './clean_state';

export async function putFiles(
  dir: string,
  files: {[name: string]: string}
): Promise<void> {
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    await fs.promises.mkdir(path.dirname(filePath), {recursive: true});
    await fs.promises.writeFile(path.join(dir, name), content);
  }
}

/**
 * Returns a state with the path to a temporary directory, installing an
 * afterEach hook to remove the directory.
 */
export function tempDir(): {path: string} {
  const state = cleanState(async () => {
    return {
      path: await fs.promises.mkdtemp(os.tmpdir() + '/'),
    };
  });
  afterEach(() => fs.promises.rm(state.path, {recursive: true}));
  return state;
}

const PUBLIC_MANIFEST = `[core]
\trepositoryformatversion = 0
\tfilemode = true
[filter "lfs"]
\tsmudge = git-lfs smudge --skip -- %f
\tprocess = git-lfs filter-process --skip
[remote "origin"]
\turl = https://chromium.googlesource.com/chromiumos/manifest
\tfetch = +refs/heads/*:refs/remotes/origin/*
[manifest]
\tplatform = auto
[branch "default"]
\tremote = origin
\tmerge = refs/heads/main
`;

async function repoInit(root: string) {
  await putFiles(root, {
    '.repo/manifests.git/config': PUBLIC_MANIFEST,
  });
}

/**
 * Builds fake chroot environment under tempDir, and returns the path to the
 * fake chroot (`${tempDir}/chroot`).
 */
export async function buildFakeChroot(tempDir: string): Promise<Chroot> {
  await repoInit(tempDir);
  await putFiles(tempDir, {'chroot/etc/cros_chroot_version': '42'});
  return path.join(tempDir, 'chroot') as Chroot;
}

const DOT_GCLIENT = `solutions = [
  {
    "name": "src",
    "url": "https://chromium.googlesource.com/chromium/src.git",
    "managed": False,
    "custom_deps": {},
    "custom_vars": {},
  },
]
target_os = ['chromeos']
`;

/**
 * Make the root be recognized as the chromium root directory.
 */
export async function buildFakeChromium(root: string): Promise<void> {
  await putFiles(root, {
    '.gclient': DOT_GCLIENT,
  });
}

/**
 * Returns the path to the extension root.
 * This function can be called from unit tests.
 */
export function getExtensionUri(): vscode.Uri {
  const dir = path.normalize(path.join(__dirname, '..', '..', '..'));
  return vscode.Uri.file(dir);
}

const fsSetupCacheDir = path.join(
  os.homedir(),
  '.cache/cros-ide-test/fs-setup'
);

/**
 * Set up dir running init. The resulting state is cached to speed up the
 * operation from the second time.
 *
 * @param dir must be an empty directory.
 * @param init must not have any side effect other than setting up dir, because
 * it is not executed if cache exists.
 * @param cacheKey must be globally unique and must be valid as a directory
 * name.
 * @param version must be updated when the result of init changes without the
 * implementation of init being updated.
 *
 * The tuple [init.toString(), cacheKey, version] determines the cache location.
 */
export async function cachedSetup(
  dir: string,
  init: () => Promise<void>,
  cacheKey: string,
  version = 0
): Promise<void> {
  // Assert empty
  for (const x of await fs.promises.readdir(dir)) {
    throw new Error(`dir ${dir} must be empty, but has ${x}`);
  }

  const dirForKey = path.join(fsSetupCacheDir, cacheKey);
  await fs.promises.mkdir(dirForKey, {recursive: true});

  const hash = crypto.createHash('sha1');
  hash.update(init.toString());
  hash.update(version.toString());
  const cachePath = path.join(dirForKey, hash.digest('hex'));

  // Clean up stale cache.
  for (const x of await fs.promises.readdir(dirForKey)) {
    const existingCachePath = path.join(dirForKey, x);

    if (existingCachePath !== cachePath) {
      await fs.promises.rm(existingCachePath, {recursive: true});
    }
  }

  if (fs.existsSync(cachePath)) {
    // Remove the empty dir and copy the cache to dir.
    await fs.promises.rmdir(dir);
    await commonUtil.execOrThrow('cp', ['-r', cachePath, dir]);
    return;
  }

  await init();
  try {
    await commonUtil.execOrThrow('cp', ['-r', dir, cachePath]);
  } catch (e) {
    await fs.promises.rm(cachePath, {recursive: true});
    throw e;
  }
}
