// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Board} from '../../../../../shared/app/common/chromiumos/board_or_host/board';
import {NoBoardError} from '../../../../../shared/app/common/chromiumos/boards';
import * as defaultBoard from '../../../../../shared/app/features/default_board';
import * as config from '../../../../../shared/app/services/config';
import {Platform} from '../../../../../shared/driver';
import * as testing from '../../../testing';
import {
  installVscodeDouble,
  installFakeConfigs,
} from '../../../testing/doubles';

describe('getOrSelectDefaultBoard on vscode', () => {
  const tempDir = testing.tempDir();

  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);

  it('returns stored board', async () => {
    await config.board.update('amd64-generic');
    const {chroot} = await testing.buildFakeChromeos(tempDir.path);

    expect(await defaultBoard.getOrPromptToSelectDefaultBoard(chroot)).toEqual(
      Board.newBoard('amd64-generic')
    );
  });

  it('returns error if no board has been setup', async () => {
    const {chroot} = await testing.buildFakeChromeos(tempDir.path);

    const error = await defaultBoard.getOrPromptToSelectDefaultBoard(chroot);
    expect(error).toBeInstanceOf(NoBoardError);
    if (error instanceof NoBoardError) {
      expect(error.message).toContain('no board has been setup');
    }
    expect(config.board.get()).toBe('');
  });

  it('shows default board', async () => {
    const {chroot} = await testing.buildFakeChromeos(tempDir.path);
    await testing.putFiles(chroot, {
      '/build/amd64-generic/x': 'x',
      '/build/bin/x': 'x',
    });

    vscodeSpy.window.showWarningMessage
      .withArgs(
        'Default board is not set. Do you want to use amd64-generic?',
        jasmine.anything(),
        jasmine.anything()
      )
      .and.returnValue('Yes');

    expect(await defaultBoard.getOrPromptToSelectDefaultBoard(chroot)).toEqual(
      Board.newBoard('amd64-generic')
    );
    expect(config.board.get()).toBe('amd64-generic');
  });

  it('shows boards to select', async () => {
    const {chroot} = await testing.buildFakeChromeos(tempDir.path);
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
        jasmine.anything(),
        jasmine.anything()
      )
      .and.returnValue('Select from list');
    vscodeSpy.window.showQuickPick
      .withArgs(jasmine.arrayContaining(['amd64-generic', 'coral', 'eve']), {
        title: 'Default board',
      })
      .and.returnValue('coral');

    expect(await defaultBoard.getOrPromptToSelectDefaultBoard(chroot)).toEqual(
      Board.newBoard('coral')
    );
    expect(config.board.get()).toBe('coral');
  });

  it('returns undefined if message is dismissed', async () => {
    const {chroot} = await testing.buildFakeChromeos(tempDir.path);
    await testing.putFiles(chroot, {
      '/build/amd64-generic/x': 'x',
      '/build/bin/x': 'x',
    });

    vscodeSpy.window.showWarningMessage
      .withArgs(
        'Default board is not set. Do you want to use amd64-generic?',
        jasmine.anything(),
        jasmine.anything()
      )
      .and.returnValue(undefined);

    expect(
      await defaultBoard.getOrPromptToSelectDefaultBoard(chroot)
    ).toBeUndefined();
    expect(config.board.get()).toBe('');
  });

  it('returns undefined if picker is dismissed', async () => {
    const {chroot} = await testing.buildFakeChromeos(tempDir.path);
    await testing.putFiles(chroot, {
      '/build/amd64-generic/x': 'x',
      '/build/bin/x': 'x',
    });

    vscodeSpy.window.showWarningMessage
      .withArgs(
        'Default board is not set. Do you want to use amd64-generic?',
        jasmine.anything(),
        jasmine.anything()
      )
      .and.returnValue('Select from list');
    vscodeSpy.window.showQuickPick
      .withArgs(jasmine.arrayContaining(['amd64-generic']), {
        title: 'Default board',
      })
      .and.returnValue(undefined);

    expect(
      await defaultBoard.getOrPromptToSelectDefaultBoard(chroot)
    ).toBeUndefined();
    expect(config.board.get()).toBe('');
  });
});

describe('getOrSelectDefaultBoard on cider', () => {
  const tempDir = testing.tempDir();

  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);
  const fakeExec = testing.installFakeExec();
  const state = testing.cleanState(async () => {
    const {chroot} = await testing.buildFakeChromeos(tempDir.path);
    return {chroot};
  });

  it('returns stored board', async () => {
    await config.board.update('amd64-generic');

    expect(
      await defaultBoard.getOrPromptToSelectDefaultBoard(
        state.chroot,
        Platform.CIDER
      )
    ).toEqual(Board.newBoard('amd64-generic'));
  });

  // This case should never happen in real life for `cros query boards` to return nothing.
  it('returns error if no board is available', async () => {
    fakeExec.installStdout(
      jasmine.stringContaining('cros'),
      ['query', 'boards'],
      ''
    );

    const error = await defaultBoard.getOrPromptToSelectDefaultBoard(
      state.chroot,
      Platform.CIDER
    );

    expect(error).toBeInstanceOf(NoBoardError);
    if (error instanceof NoBoardError) {
      expect(error.message).toContain(
        '`cros query boards` returns empty list unexpectedly'
      );
    }
    expect(config.board.get()).toBe('');
  });

  it('shows boards to select', async () => {
    fakeExec.installStdout(
      jasmine.stringContaining('cros'),
      ['query', 'boards'],
      ['amd64-generic', 'coral', 'eve'].join('\n')
    );

    vscodeSpy.window.showWarningMessage
      .withArgs(
        jasmine.stringContaining('Default board is not set.'),
        jasmine.anything()
      )
      .and.returnValue('Select from list');
    vscodeSpy.window.showQuickPick
      .withArgs(
        jasmine.arrayWithExactContents(['amd64-generic', 'coral', 'eve']),
        {
          title: 'Default board',
        }
      )
      .and.returnValue('coral');

    expect(
      await defaultBoard.getOrPromptToSelectDefaultBoard(
        state.chroot,
        Platform.CIDER
      )
    ).toEqual(Board.newBoard('coral'));
    expect(config.board.get()).toBe('coral');
  });

  it('returns undefined if message is dismissed', async () => {
    fakeExec.installStdout(
      jasmine.stringContaining('cros'),
      ['query', 'boards'],
      ['amd64-generic', 'coral', 'eve'].join('\n')
    );

    vscodeSpy.window.showWarningMessage
      .withArgs('Default board is not set.', jasmine.anything())
      .and.returnValue(undefined);

    expect(
      await defaultBoard.getOrPromptToSelectDefaultBoard(
        state.chroot,
        Platform.CIDER
      )
    ).toBeUndefined();
    expect(config.board.get()).toBe('');
  });

  it('returns undefined if picker is dismissed', async () => {
    fakeExec.installStdout(
      jasmine.stringContaining('cros'),
      ['query', 'boards'],
      ['amd64-generic', 'coral', 'eve'].join('\n')
    );

    vscodeSpy.window.showWarningMessage
      .withArgs('Default board is not set.', jasmine.anything())
      .and.returnValue('Select from list');
    vscodeSpy.window.showQuickPick
      .withArgs(jasmine.arrayContaining(['amd64-generic']), {
        title: 'Default board',
      })
      .and.returnValue(undefined);

    expect(
      await defaultBoard.getOrPromptToSelectDefaultBoard(
        state.chroot,
        Platform.CIDER
      )
    ).toBeUndefined();
    expect(config.board.get()).toBe('');
  });
});
