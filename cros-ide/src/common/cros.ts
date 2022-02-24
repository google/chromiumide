// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as commonUtil from './common_util';

/**
 * @returns Boards that have been set up, ordered by access time (newest to
 * oldest).
 */
export async function getSetupBoards(rootDir: string = '/'): Promise<string[]> {
  const build = path.join(rootDir, 'build');
  const dirs = await fs.promises.readdir(build);
  const dirStat: Array<[string, fs.Stats]> = [];
  for (const dir of dirs) {
    if (dir === 'bin') {
      continue;
    }
    dirStat.push([dir, await fs.promises.stat(path.join(build, dir))]);
  }
  dirStat.sort(([, a], [, b]) => {
    if (a.atimeMs === b.atimeMs) {
      return 0;
    }
    return a.atimeMs < b.atimeMs ? 1 : -1;
  });
  return dirStat.map(([x]) => x);
}

/**
 * @returns Packages that are worked on.
 */
export async function getWorkedOnPackages(board: string): Promise<string[]> {
  const stdout = await commonUtil.exec(
      'cros_workon', ['--board', board, 'list']);
  return stdout.split('\n').filter(x => x.trim() !== '');
}
