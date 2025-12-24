// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as commonUtil from '../../common/common_util';
import {getDriver} from '../driver_repository';
import {WrapFs} from '../wrap_fs';
import {crosExeFor} from './cros';

const driver = getDriver();

export class NoBoardError extends Error {
  constructor(message: string) {
    super(`no board available: ${message}`);
  }
}

/**
 * @returns All ChromeOS boards that can be set up.
 * @param chromiumosRoot path to the repo root, for finding 'cros' command.
 */
export async function getAllChromeosBoards(
  chromiumosRoot: string
): Promise<string[] | NoBoardError | Error> {
  const crosExe = await crosExeFor(chromiumosRoot);
  if (!crosExe) {
    return new Error(
      'Cannot find `cros` to list all ChromeOS boards: not in ChromeOS directory?'
    );
  }

  const output = await commonUtil.exec(crosExe, ['query', 'boards']);
  if (output instanceof Error) {
    return output;
  }
  const boards = output.stdout.split('\n').filter(s => s !== '');
  if (boards.length === 0) {
    return new NoBoardError(
      '`cros query boards` returns empty list unexpectedly'
    );
  }
  return boards;
}

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
  const fsNames = ['chroot', 'out'];
  for (const [i, fs] of [chroot, out].entries()) {
    const boards = await getSetupBoardsOrderedInner(fs, keyFn, compareFn);
    if (boards.length > 0) {
      driver.metrics.send({
        category: 'background',
        group: 'boards_and_packages',
        name: 'boards_and_packages_get_setup_boards',
        description: 'get already boards setup',
        build_dir: fsNames[i],
      });
    }
    res.push(...boards);
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
