// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import {TEST_ONLY} from '../../features/boards_packages';
import {installVscodeDouble} from '../integration/doubles';
import {fakeGetConfiguration} from '../integration/fakes/workspace_configuration';
import {exactMatch, installFakeExec, putFiles} from '../testing';

const {Board, Package, BoardPackageProvider, crosWorkonStart, crosWorkonStop} =
  TEST_ONLY;

describe('Boards and Packages view', () => {
  const {vscodeSpy} = installVscodeDouble();
  const {fakeExec} = installFakeExec();

  it('shows a message when starting work on a non existing package', async () => {
    vscodeSpy.window.showInputBox.and.resolveTo('no-such-package');

    fakeExec.on(
      'cros_workon',
      exactMatch(['--board=eve', 'start', 'no-such-package'], async () => {
        return {
          stdout: '',
          stderr: 'could not find the package',
          exitStatus: 1,
        };
      })
    );

    const board = new Board('eve');
    await crosWorkonStart(board);
    expect(vscodeSpy.window.showErrorMessage.calls.argsFor(0)).toEqual([
      'cros_workon failed: could not find the package',
    ]);
  });

  it('shows a message if cros_workon is not found', async () => {
    fakeExec.on(
      'cros_workon',
      exactMatch(['--board=eve', 'stop', 'shill'], async () => {
        return new Error('cros_workon not found');
      })
    );

    const board = new Board('eve');
    const pkg = new Package(board, 'shill');
    await crosWorkonStop(pkg);
    expect(vscodeSpy.window.showErrorMessage.calls.argsFor(0)).toEqual([
      'cros_workon not found',
    ]);
  });

  // TODO(ttylenda): test error cases
  it('lists setup boards and packages', async () => {
    await commonUtil.withTempDir(async td => {
      await putFiles(td, {
        '/build/amd64-generic/x': 'x',
        '/build/bin/x': 'x',
        '/build/coral/x': 'x',
      });

      vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
      vscode.workspace
        .getConfiguration('cros-ide')
        .update('boardsAndPackages.showWelcomeMessage', false);

      fakeExec.on(
        'cros_workon',
        exactMatch(['--board', 'coral', 'list'], async () => {
          return `chromeos-base/cryptohome
chromeos-base/shill`;
        })
      );

      const bpProvider = new BoardPackageProvider(td);

      // List boards.
      const boards = await bpProvider.getChildren();
      expect(boards).toEqual([
        jasmine.objectContaining({
          label: 'amd64-generic',
          contextValue: 'board',
        }),
        jasmine.objectContaining({
          label: 'coral',
          contextValue: 'board',
        }),
      ]);

      // List active packages for coral.
      const coral = boards[1];
      const pkgs = await bpProvider.getChildren(coral);
      expect(pkgs).toEqual([
        jasmine.objectContaining({
          label: 'chromeos-base/cryptohome',
          contextValue: 'package',
        }),
        jasmine.objectContaining({
          label: 'chromeos-base/shill',
          contextValue: 'package',
        }),
      ]);
    });
  });
});
