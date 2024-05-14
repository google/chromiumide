// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Board} from '../../../../../shared/app/common/chromiumos/board_or_host/board';
import {WrapFs} from '../../../../../shared/app/common/wrap_fs';
import * as defaultBoard from '../../../../../shared/app/features/default_board';
import * as config from '../../../../../shared/app/services/config';
import * as testing from '../../../testing';
import {
  installVscodeDouble,
  installFakeConfigs,
} from '../../../testing/doubles';

describe('getOrSelectDefaultBoard', () => {
  const tempDir = testing.tempDir();

  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);

  it('returns stored board', async () => {
    await config.board.update('amd64-generic');
    const chroot = await testing.buildFakeChroot(tempDir.path);

    expect(
      await defaultBoard.getOrSelectDefaultBoard(new WrapFs(chroot))
    ).toEqual(Board.newBoard('amd64-generic'));
  });

  it('returns error if no board has been setup', async () => {
    const chroot = await testing.buildFakeChroot(tempDir.path);

    expect(
      await defaultBoard.getOrSelectDefaultBoard(new WrapFs(chroot))
    ).toEqual(new defaultBoard.NoBoardError());
    expect(config.board.get()).toBe('');
  });

  it('shows default board', async () => {
    const chroot = await testing.buildFakeChroot(tempDir.path);
    await testing.putFiles(chroot, {
      '/build/amd64-generic/x': 'x',
      '/build/bin/x': 'x',
    });

    vscodeSpy.window.showWarningMessage
      .withArgs(
        'Default board is not set. Do you want to use amd64-generic?',
        {title: 'Yes'},
        {title: 'Customize'}
      )
      .and.returnValue({title: 'Yes'});

    expect(
      await defaultBoard.getOrSelectDefaultBoard(new WrapFs(chroot))
    ).toEqual(Board.newBoard('amd64-generic'));
    expect(config.board.get()).toBe('amd64-generic');
  });

  it('shows boards to select', async () => {
    const chroot = await testing.buildFakeChroot(tempDir.path);
    await testing.putFiles(chroot, {
      '/build/amd64-generic/x': 'x',
      '/build/bin/x': 'x',
      '/build/coral/x': 'x',
      '/build/eve/x': 'x',
    });

    vscodeSpy.window.showWarningMessage
      .withArgs(
        jasmine.stringContaining(
          'Default board is not set. Do you want to use '
        ),
        {title: 'Yes'},
        {title: 'Customize'}
      )
      .and.returnValue({title: 'Customize'});
    vscodeSpy.window.showQuickPick
      .withArgs(jasmine.arrayContaining(['amd64-generic', 'coral', 'eve']), {
        title: 'Default board',
      })
      .and.returnValue('coral');

    expect(
      await defaultBoard.getOrSelectDefaultBoard(new WrapFs(chroot))
    ).toEqual(Board.newBoard('coral'));
    expect(config.board.get()).toBe('coral');
  });

  it('returns undefined if message is dismissed', async () => {
    const chroot = await testing.buildFakeChroot(tempDir.path);
    await testing.putFiles(chroot, {
      '/build/amd64-generic/x': 'x',
      '/build/bin/x': 'x',
    });

    vscodeSpy.window.showWarningMessage
      .withArgs(
        'Default board is not set. Do you want to use amd64-generic?',
        {title: 'Yes'},
        {title: 'Customize'}
      )
      .and.returnValue(undefined);

    expect(
      await defaultBoard.getOrSelectDefaultBoard(new WrapFs(chroot))
    ).toBeUndefined();
    expect(config.board.get()).toBe('');
  });
});
