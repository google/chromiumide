// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import {
  getAllChromeosBoards,
  getSetupBoardsRecentFirst,
  getSetupBoardsAlphabetic,
} from '../../../../../shared/app/common/chromiumos/boards';
import * as commonUtil from '../../../../../shared/app/common/common_util';
import {WrapFs} from '../../../../../shared/app/common/wrap_fs';
import * as testing from '../../../testing';

async function prepareBoardsDir(td: string): Promise<{
  chroot: string;
  out: string;
}> {
  const {chroot} = await testing.buildFakeChromeos(td);
  await testing.putFiles(chroot, {
    '/build/amd64-generic/x': 'x',
    '/build/betty-pi-arc/x': 'x',
    '/build/bin/x': 'x',
    '/build/coral/x': 'x',
  });

  await fs.promises.utimes(
    path.join(chroot, '/build/amd64-generic'),
    2 /* timestamp */,
    2
  );
  await fs.promises.utimes(path.join(chroot, '/build/betty-pi-arc'), 1, 1);
  await fs.promises.utimes(path.join(chroot, '/build/coral'), 3, 3);
  return {chroot, out: commonUtil.crosOutDir(commonUtil.crosRoot(chroot))};
}

describe('Boards that are set up', () => {
  const tempDir = testing.tempDir();

  it('are listed most recent first', async () => {
    const {chroot, out} = await prepareBoardsDir(tempDir.path);

    expect(
      await getSetupBoardsRecentFirst(new WrapFs(chroot), new WrapFs(out))
    ).toEqual(['coral', 'amd64-generic', 'betty-pi-arc']);
  });

  it('are listed in alphabetic order', async () => {
    const {chroot, out} = await prepareBoardsDir(tempDir.path);

    expect(
      await getSetupBoardsAlphabetic(new WrapFs(chroot), new WrapFs(out))
    ).toEqual(['amd64-generic', 'betty-pi-arc', 'coral']);
  });

  it('can be listed, even if /build does not exist', async () => {
    expect(
      await getSetupBoardsAlphabetic(
        new WrapFs(tempDir.path),
        new WrapFs(tempDir.path)
      )
    ).toEqual([]);
  });
});

describe('getAllChromeosBoards', () => {
  const fakeExec = testing.installFakeExec();
  const tempDir = testing.tempDir();
  testing.cleanState(async () => {
    await testing.buildFakeChromeos(tempDir.path);
  });

  it('returns all CrOS boards', async () => {
    const BOARDS = [
      'amd64-generic',
      'amd64-generic-embedded',
      'amd64-generic-koosh',
    ];
    fakeExec.installStdout(
      jasmine.stringContaining('cros'),
      ['query', 'boards'],
      BOARDS.join('\n')
    );
    await getAllChromeosBoards(tempDir.path);
    expect(await getAllChromeosBoards(tempDir.path)).toEqual(BOARDS);
  });
});
