// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as config from '../../../services/config';
import {Source} from '../../../common/common_util';
import {WrapFs} from '../../../common/cros';
import {TEST_ONLY} from '../../../features/boards_packages';
import {ChrootService} from '../../../services/chroot';
import {
  buildFakeChroot,
  exactMatch,
  installFakeExec,
  putFiles,
  tempDir,
} from '../../testing';
import {installVscodeDouble, installFakeConfigs} from '../doubles';

const {BoardItem, PackageItem, BoardPackageProvider, BoardsPackages} =
  TEST_ONLY;

describe('Boards and Packages view', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);
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

    const board = new BoardItem('eve');
    await new BoardsPackages(chrootService).crosWorkonStart(board);
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

    const board = new BoardItem('eve');
    const pkg = new PackageItem(board, 'shill');
    await new BoardsPackages(chrootService).crosWorkonStop(pkg);
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

    await config.boardsAndPackages.showWelcomeMessage.update(false);

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

    await config.boardsAndPackages.showWelcomeMessage.update(false);

    fakeExec.on(
      'cros_workon',
      exactMatch(['--board', 'coral', 'list'], async () => {
        return `chromeos-base/cryptohome
chromeos-base/shill`;
      })
    );
  });

  it('opens ebuild file', async () => {
    await config.boardsAndPackages.showWelcomeMessage.update(false);

    const chrootService = jasmine.createSpyObj<ChrootService>('chrootService', [
      'exec',
      'source',
    ]);
    chrootService.exec
      .withArgs(
        'equery-amd64-generic',
        ['which', '-m', 'chromeos-base/shill'],
        jasmine.any(Object)
      )
      .and.returnValue(
        Promise.resolve({
          exitStatus: 0,
          stdout:
            '/mnt/host/source/src/third_party/chromiumos-overlay/chromeos-base/shill/shill-9999.ebuild\n',
          stderr: '',
        })
      );
    chrootService.source.and.returnValue(
      new WrapFs('/path/to/chromeos' as Source)
    );

    const board = new BoardItem('amd64-generic');
    const pkg = new PackageItem(board, 'chromeos-base/shill');
    await new BoardsPackages(chrootService).openEbuild(pkg);

    expect(vscodeSpy.workspace.openTextDocument).toHaveBeenCalledWith(
      '/path/to/chromeos/src/third_party/chromiumos-overlay/chromeos-base/shill/shill-9999.ebuild'
    );
    expect(vscodeSpy.window.showTextDocument).toHaveBeenCalled();
  });
});
