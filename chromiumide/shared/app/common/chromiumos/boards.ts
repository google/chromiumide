// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {getDriver} from '../driver_repository';
import {WrapFs} from '../wrap_fs';

const driver = getDriver();

/**
 * @returns Boards that have been set up, ordered by access time (newest to
 * oldest).
 */
export async function getSetupBoardsRecentFirst(
  chroot: WrapFs,
  out: WrapFs
): Promise<string[]> {
  return getSetupBoardsOrdered(
    chroot,
    out,
    async (fs, dir) => fs.aTime(dir),
    (a, b) => b - a
  );
}

/**
 * @returns Boards that have been set up in alphabetic order.
 */
export async function getSetupBoardsAlphabetic(
  chroot: WrapFs,
  out: WrapFs
): Promise<string[]> {
  return getSetupBoardsOrdered(
    chroot,
    out,
    async (_fs, dir) => dir,
    (a, b) => a.localeCompare(b)
  );
}

async function getSetupBoardsOrdered<T>(
  chroot: WrapFs,
  out: WrapFs,
  keyFn: (fs: WrapFs, dir: string) => Promise<T>,
  compareFn: (a: T, b: T) => number
): Promise<string[]> {
  const res = [];
  for (const fs of [chroot, out]) {
    res.push(...(await getSetupBoardsOrderedInner(fs, keyFn, compareFn)));
  }
  return res;
}

async function getSetupBoardsOrderedInner<T>(
  fs: WrapFs,
  keyFn: (fs: WrapFs, dir: string) => Promise<T>,
  compareFn: (a: T, b: T) => number
): Promise<string[]> {
  const build = '/build';

  // /build does not exist outside chroot, which causes problems in tests.
  if (!(await fs.exists(build))) {
    return [];
  }

  const dirs = await fs.readdir(build);
  const dirStat: Array<[string, T]> = [];
  for (const dir of dirs) {
    // README file exists in chroot/build if it's a directory on which out/build
    // is mounted in chroot.
    if (dir === 'bin' || dir === 'README') {
      continue;
    }
    dirStat.push([dir, await keyFn(fs, driver.path.join(build, dir))]);
  }
  dirStat.sort(([, a], [, b]) => compareFn(a, b));
  return dirStat.map(([x]) => x);
}
