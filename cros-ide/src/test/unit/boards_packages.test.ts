// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import {WrapFs} from '../../common/cros';
import {TEST_ONLY} from '../../features/boards_packages';
import {ChrootService} from '../../services/chroot';
import {installVscodeDouble} from '../integration/doubles';
import {fakeGetConfiguration} from '../integration/fakes/workspace_configuration';
import {
  buildFakeChroot,
  exactMatch,
  installFakeExec,
  putFiles,
  tempDir,
} from '../testing';

const {Board, Package, BoardPackageProvider, crosWorkonStart, crosWorkonStop} =
  TEST_ONLY;

describe('Boards and Packages view', () => {
  const {vscodeSpy} = installVscodeDouble();
  const {fakeExec} = installFakeExec();
  const temp = tempDir();

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
    const chrootService = new ChrootService(
      undefined,
      undefined,
      /* isInsideChroot = */ () => true
    );

    const board = new Board('eve');
    await crosWorkonStart(chrootService, board);
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
    const chrootService = new ChrootService(
      undefined,
      undefined,
      /* isInsideChroot = */ () => true
    );

    const board = new Board('eve');
    const pkg = new Package(board, 'shill');
    await crosWorkonStop(chrootService, pkg);
    expect(vscodeSpy.window.showErrorMessage.calls.argsFor(0)).toEqual([
      'cros_workon not found',
    ]);
  });

  // TODO(ttylenda): test error cases
  it('lists setup boards and packages', async () => {
    const chroot = await buildFakeChroot(temp.path);
    await putFiles(chroot, {
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
      exactMatch(['--board=coral', 'list'], async () => {
        return `chromeos-base/cryptohome
chromeos-base/shill`;
      })
    );

    fakeExec.on(
      'cros_workon',
      exactMatch(['--host', 'list'], async () => {
        return 'chromeos-base/libbrillo';
      })
    );

    const bpProvider = new BoardPackageProvider(
      new ChrootService(
        new WrapFs(chroot),
        undefined,
        /* isInsideChroot = */ () => true
      )
    );

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
      jasmine.objectContaining({
        label: 'host',
        contextValue: 'board',
      }),
    ]);

    // List active packages for coral.
    const coral = boards[1];
    const coral_pkgs = await bpProvider.getChildren(coral);
    expect(coral_pkgs).toEqual([
      jasmine.objectContaining({
        label: 'chromeos-base/cryptohome',
        contextValue: 'package',
      }),
      jasmine.objectContaining({
        label: 'chromeos-base/shill',
        contextValue: 'package',
      }),
    ]);

    // List active packages for host.
    const host = boards[2];
    const host_pkgs = await bpProvider.getChildren(host);
    expect(host_pkgs).toEqual([
      jasmine.objectContaining({
        label: 'chromeos-base/libbrillo',
        contextValue: 'package',
      }),
    ]);

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
  });
});
