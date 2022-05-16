// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';

// Wraps functions in fs or fs.promises, adding prefix to given paths.
export class WrapFs<T extends string> {
  constructor(readonly root: T) {}

  private realpath(p: string): string {
    if (p.startsWith(this.root)) {
      return p;
    }
    return path.join(this.root, p);
  }

  async copyFile(p: string, dest: string): Promise<void> {
    return fs.promises.copyFile(this.realpath(p), dest);
  }

  async stat(p: string): Promise<fs.Stats> {
    return fs.promises.stat(this.realpath(p));
  }

  existsSync(p: string): boolean {
    return fs.existsSync(this.realpath(p));
  }

  async readdir(p: string): Promise<string[]> {
    return fs.promises.readdir(this.realpath(p));
  }

  async rm(p: string, opts?: {force?: boolean}): Promise<void> {
    return fs.promises.rm(this.realpath(p), opts);
  }

  watchSync(
    p: string,
    listener: (eventType: string, fileName: string) => void
  ) {
    fs.watch(this.realpath(p), listener);
  }
}

/**
 * @returns Boards that have been set up, ordered by access time (newest to
 * oldest).
 */
export async function getSetupBoardsRecentFirst(
  rootDir = '/'
): Promise<string[]> {
  return getSetupBoardsOrdered(
    rootDir,
    async dir => fs.promises.stat(dir),
    (a, b) => b.atimeMs - a.atimeMs
  );
}

/**
 * @returns Boards that have been set up in alphabetic order.
 */
export async function getSetupBoardsAlphabetic(
  rootDir = '/'
): Promise<string[]> {
  return getSetupBoardsOrdered(
    rootDir,
    async dir => dir,
    (a, b) => a.localeCompare(b)
  );
}

async function getSetupBoardsOrdered<T>(
  rootDir = '/',
  keyFn: (dir: string) => Promise<T>,
  compareFn: (a: T, b: T) => number
): Promise<string[]> {
  const build = path.join(rootDir, 'build');

  // /build does not exist outside chroot, which causes problems in tests.
  if (!fs.existsSync(build)) {
    return [];
  }

  const dirs = await fs.promises.readdir(build);
  const dirStat: Array<[string, T]> = [];
  for (const dir of dirs) {
    if (dir === 'bin') {
      continue;
    }
    dirStat.push([dir, await keyFn(path.join(build, dir))]);
  }
  dirStat.sort(([, a], [, b]) => compareFn(a, b));
  return dirStat.map(([x]) => x);
}
