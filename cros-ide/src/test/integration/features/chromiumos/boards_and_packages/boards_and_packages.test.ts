// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getCrosPath} from '../../../../../common/chromiumos/cros';
import {BoardsAndPackages} from '../../../../../features/chromiumos/boards_and_packages';
import {Breadcrumbs} from '../../../../../features/chromiumos/boards_and_packages/item';
import {ChrootService} from '../../../../../services/chromiumos';
import {underDevelopment} from '../../../../../services/config';
import * as testing from '../../../../testing';
import {FakeStatusManager} from '../../../../testing/fakes';

describe('Boards and packages', () => {
  const tempDir = testing.tempDir();

  const {fakeExec} = testing.installFakeExec();

  const subscriptions: vscode.Disposable[] = [];

  const originalFlagValue = underDevelopment.boardsAndPackagesV2.get();

  afterEach(async () => {
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.splice(0);

    await underDevelopment.boardsAndPackagesV2.update(originalFlagValue);
  });

  it('supports revealing tree items from breadcrumbs', async () => {
    const chromiumosRoot = tempDir.path;

    const chroot = await testing.buildFakeChroot(chromiumosRoot);

    await testing.putFiles(chroot, {
      'build/betty/fake': 'x',
    });

    const chrootService = ChrootService.maybeCreate(
      chromiumosRoot,
      /* setContext = */ false
    )!;

    const boardsAndPackages = new BoardsAndPackages(
      chrootService,
      new FakeStatusManager()
    );
    subscriptions.push(boardsAndPackages);

    const treeView = boardsAndPackages.getTreeViewForTesting();

    expect(treeView.title).toEqual('Boards and Packages');

    const cros = getCrosPath(chromiumosRoot);

    fakeExec
      .on(
        cros,
        testing.exactMatch(
          ['query', 'ebuilds', '-b', 'amd64-host', '-o', '{package_info.atom}'],
          async () => 'chromeos-base/codelab\n'
        )
      )
      .on(
        cros,
        testing.exactMatch(
          ['query', 'ebuilds', '-b', 'betty', '-o', '{package_info.atom}'],
          async () => 'chromeos-base/codelab\n'
        )
      );

    await treeView.reveal(Breadcrumbs.from('host', 'chromeos-base', 'codelab'));
    await treeView.reveal(
      Breadcrumbs.from('betty', 'chromeos-base', 'codelab')
    );

    await expectAsync(
      treeView.reveal(Breadcrumbs.from('betty', 'chromeos-base', 'not-exist'))
    ).toBeRejected();
  });
});
