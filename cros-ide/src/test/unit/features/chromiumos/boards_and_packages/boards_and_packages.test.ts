// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getCrosPath} from '../../../../../common/chromiumos/cros';
import * as commonUtil from '../../../../../common/common_util';
import {BoardsAndPackages} from '../../../../../features/chromiumos/boards_and_packages';
import {Breadcrumbs} from '../../../../../features/chromiumos/boards_and_packages/item';
import {ChrootService} from '../../../../../services/chromiumos';
import * as config from '../../../../../services/config';
import * as testing from '../../../../testing';
import {FakeStatusManager, VoidOutputChannel} from '../../../../testing/fakes';

describe('Boards and packages', () => {
  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();

  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const tempDir = testing.tempDir();

  const {fakeExec} = testing.installFakeExec();
  testing.fakes.installFakeSudo(fakeExec);

  const subscriptions: vscode.Disposable[] = [];

  afterEach(async () => {
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.splice(0);
  });

  const state = testing.cleanState(async () => {
    await config.underDevelopment.boardsAndPackagesV2.update(true);

    vscodeSpy.window.createOutputChannel.and.returnValue(
      new VoidOutputChannel()
    );

    const chromiumosRoot = tempDir.path as commonUtil.Source;

    const chroot = await testing.buildFakeChroot(chromiumosRoot);

    const chrootService = ChrootService.maybeCreate(
      chromiumosRoot,
      /* setContext = */ false
    )!;

    const boardsAndPackages = new BoardsAndPackages(
      chrootService,
      new FakeStatusManager()
    );
    subscriptions.push(boardsAndPackages);

    return {
      chromiumosRoot,
      chroot,
      boardsAndPackages,
    };
  });

  it('supports revealing tree items from breadcrumbs', async () => {
    const {chromiumosRoot, chroot, boardsAndPackages} = state;

    // Prepare betty board.
    await testing.putFiles(chroot, {
      'build/betty/fake': 'x',
    });

    const treeView = boardsAndPackages.getTreeViewForTesting();
    const treeDataProvider = boardsAndPackages.getTreeDataProviderForTesting();

    // Test the tree view title.
    expect(treeView.title).toEqual('Boards and Packages');

    // Prepare cros command outputs.
    const cros = getCrosPath(chromiumosRoot);
    for (const board of ['amd64-host', 'betty']) {
      fakeExec.on(
        cros,
        testing.exactMatch(
          ['query', 'ebuilds', '-b', board, '-o', '{package_info.atom}'],
          async () => `chromeos-base/codelab
chromeos-base/shill
dev-go/delve
`
        ),
        testing.exactMatch(
          ['workon', '-b', board, 'list'],
          async () => 'chromeos-base/codelab\n'
        ),
        testing.exactMatch(
          ['workon', '-b', board, 'list', '--all'],
          async () => `chromeos-base/codelab
chromeos-base/shill
`
        )
      );
    }

    // Test existing elements can be revealed.
    await treeView.reveal(Breadcrumbs.from('host', 'chromeos-base', 'codelab'));
    await treeView.reveal(
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab')
    );
    await expectAsync(
      treeView.reveal(Breadcrumbs.from('betty', 'chromeos-base', 'not-exist'))
    ).toBeRejected();

    // Test context values.
    const codelab = await treeDataProvider.getTreeItem(
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab')
    );
    expect(codelab.contextValue).toEqual('package-started');
    const shill = await treeDataProvider.getTreeItem(
      Breadcrumbs.from('betty', 'chromeos-base', 'shill')
    );
    expect(shill.contextValue).toEqual('package-stopped');
    const delve = await treeDataProvider.getTreeItem(
      Breadcrumbs.from('betty', 'dev-go', 'delve')
    );
    expect(delve.contextValue).toEqual('package');
  });

  it('refreshes when default board changes', async () => {
    const {boardsAndPackages} = state;

    const treeDataProvider = boardsAndPackages.getTreeDataProviderForTesting();

    const reader = new testing.EventReader(
      treeDataProvider.onDidChangeTreeData!,
      subscriptions
    );

    await config.board.update('betty');

    // Confirm an event to refresh the tree is fired.
    await reader.read();
  });

  it('refreshes on workon', async () => {
    const {boardsAndPackages, chromiumosRoot} = state;

    const treeDataProvider = boardsAndPackages.getTreeDataProviderForTesting();

    // Prepare cros_sdk command handlers.
    let started = false;
    testing.fakes.installChrootCommandHandler(
      fakeExec,
      chromiumosRoot,
      'cros_workon',
      testing.exactMatch(
        ['--board=betty', 'start', 'chromeos-base/codelab'],
        async () => {
          started = true;
          return '';
        }
      )
    );

    const reader = new testing.EventReader(
      treeDataProvider.onDidChangeTreeData!,
      subscriptions
    );

    await vscode.commands.executeCommand(
      'chromiumide.crosWorkonStart',
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab')
    );

    await reader.read();

    expect(started).toBeTrue();
  });
});
