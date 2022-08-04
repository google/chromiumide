// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {Chroot, ExecResult, Source} from '../../../common/common_util';
import {WrapFs} from '../../../common/cros';
import {ChrootService} from '../../../services/chroot';
import {
  buildFakeChroot,
  exactMatch,
  installFakeExec,
  Mutable,
  tempDir,
} from '../../testing';
import {installFakeSudo} from '../../testing/fakes';
import {installVscodeDouble} from '../doubles';

describe('chroot service', () => {
  const temp = tempDir();

  const {fakeExec} = installFakeExec();
  installFakeSudo(fakeExec);

  it('exec passes through if inside chroot', async () => {
    const cros = new ChrootService(
      undefined,
      new WrapFs(temp.path as Source),
      /* isInsideChroot = */ () => true
    );

    fakeExec.on(
      'echo',
      exactMatch(['1'], async () => '1\n')
    );
    const res = (await cros.exec('echo', ['1'], {
      sudoReason: 'to echo',
    })) as ExecResult;
    expect(res.stdout).toBe('1\n');
  });

  it('exec calls cros_sdk if outside chroot', async () => {
    const source = temp.path as Source;
    const cros = new ChrootService(
      undefined,
      new WrapFs(source),
      /* isInsideChroot = */ () => false
    );

    fakeExec.on(
      path.join(source, 'chromite/bin/cros_sdk'),
      exactMatch(['--', 'echo', '1'], async () => '1\n')
    );
    const res = (await cros.exec('echo', ['1'], {
      sudoReason: 'to echo',
    })) as ExecResult;
    expect(res.stdout).toBe('1\n');
  });

  it('exec passes through error from cros_sdk command', async () => {
    const source = temp.path as Source;
    const cros = new ChrootService(
      undefined,
      new WrapFs(source),
      /* isInsideChroot = */ () => false
    );

    fakeExec.on(
      path.join(source, 'chromite/bin/cros_sdk'),
      exactMatch(['--', 'false'], async () => new Error('failed'))
    );

    expect(await cros.exec('false', [], {sudoReason: 'to false'})).toEqual(
      new Error('failed')
    );
  });
});

describe('chroot detection', () => {
  const temp = tempDir();

  const {vscodeSpy} = installVscodeDouble();

  it('finds chroot wih single chromeos folder', async () => {
    const crosCheckout = temp.path;
    await buildFakeChroot(crosCheckout);
    (vscode.workspace as Mutable<typeof vscode.workspace>).workspaceFolders = [
      {
        uri: vscode.Uri.file(path.join(crosCheckout, 'nested/source/folder/')),
        name: 'folder',
        index: 1,
      },
    ];
    const cros = new ChrootService(
      undefined,
      undefined,
      /* isInsideChroot = */ () => false
    );
    cros.onUpdate();
    expect(cros.chroot()?.root).toEqual(
      path.join(crosCheckout, 'chroot') as Chroot
    );
    expect(vscodeSpy.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('finds chroot wih single chromeos folder and a non-chromeos folder', async () => {
    const msdosCheckout = path.join(temp.path, 'ms-dos');
    await fs.promises.mkdir(msdosCheckout);

    const crosCheckout = path.join(temp.path, 'cros');
    await fs.promises.mkdir(crosCheckout);

    await buildFakeChroot(crosCheckout);
    (vscode.workspace as Mutable<typeof vscode.workspace>).workspaceFolders = [
      {
        uri: vscode.Uri.file(path.join(msdosCheckout, 'v2.0/source/')),
        name: 'source',
        index: 1,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout, 'nested/source/folder/')),
        name: 'folder',
        index: 2,
      },
    ];
    const cros = new ChrootService(
      undefined,
      undefined,
      /* isInsideChroot = */ () => false
    );
    cros.onUpdate();
    expect(cros.chroot()?.root).toEqual(
      path.join(crosCheckout, 'chroot') as Chroot
    );
    expect(vscodeSpy.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('does not find chromeos folder when there are no folders', async () => {
    (vscode.workspace as Mutable<typeof vscode.workspace>).workspaceFolders =
      [];
    const cros = new ChrootService(
      undefined,
      undefined,
      /* isInsideChroot = */ () => false
    );
    cros.onUpdate();
    expect(cros.chroot()?.root).toBeUndefined();
    expect(vscodeSpy.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('finds a chroot when there are multiple candidates', async () => {
    const crosCheckout1 = path.join(temp.path, 'cros-1');
    await fs.promises.mkdir(crosCheckout1);
    await buildFakeChroot(crosCheckout1);

    const crosCheckout2 = path.join(temp.path, 'cros-2');
    await fs.promises.mkdir(crosCheckout2);
    await buildFakeChroot(crosCheckout2);

    (vscode.workspace as Mutable<typeof vscode.workspace>).workspaceFolders = [
      {
        uri: vscode.Uri.file(path.join(crosCheckout1, 'one/source/folder')),
        name: 'folder',
        index: 1,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout2, 'source/folder/two')),
        name: 'two',
        index: 2,
      },
    ];
    const cros = new ChrootService(
      undefined,
      undefined,
      /* isInsideChroot = */ () => false
    );
    cros.onUpdate();
    expect(cros.chroot()?.root).toEqual(
      // Either is fine, but the implementation will return the first one.
      path.join(crosCheckout1, 'chroot') as Chroot
    );
    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalled();
  });

  it('finds a chroot when multiple folders under the same chroot are opened', async () => {
    const crosCheckout = temp.path;
    await buildFakeChroot(crosCheckout);

    (vscode.workspace as Mutable<typeof vscode.workspace>).workspaceFolders = [
      {
        uri: vscode.Uri.file(path.join(crosCheckout, 'source/folder/one')),
        name: 'one',
        index: 1,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout, 'source/folder/two')),
        name: 'two',
        index: 2,
      },
    ];
    const cros = new ChrootService(
      undefined,
      undefined,
      /* isInsideChroot = */ () => false
    );
    cros.onUpdate();
    expect(cros.chroot()?.root).toEqual(
      path.join(crosCheckout, 'chroot') as Chroot
    );
    expect(vscodeSpy.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('rejects updates that would change a defined chroot (two chroots)', async () => {
    // Build two chroots.
    const crosCheckout1 = path.join(temp.path, 'cros-1');
    await fs.promises.mkdir(crosCheckout1);
    await buildFakeChroot(crosCheckout1);

    const crosCheckout2 = path.join(temp.path, 'cros-2');
    await fs.promises.mkdir(crosCheckout2);
    await buildFakeChroot(crosCheckout2);

    // Start working in one of them.
    (vscode.workspace as Mutable<typeof vscode.workspace>).workspaceFolders = [
      {
        uri: vscode.Uri.file('/some/path/'),
        name: 'path',
        index: 1,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout1, 'one/source/folder')),
        name: 'folder',
        index: 2,
      },
    ];
    const cros = new ChrootService(
      undefined,
      undefined,
      /* isInsideChroot = */ () => false
    );
    cros.onUpdate();

    expect(vscodeSpy.window.showErrorMessage).not.toHaveBeenCalled();
    expect(cros.chroot()?.root).toEqual(
      path.join(crosCheckout1, 'chroot') as Chroot
    );

    // Then change it (this is somewhat unrealistic,
    // as we would go through a step of having two chroots first).
    (vscode.workspace as Mutable<typeof vscode.workspace>).workspaceFolders = [
      {
        uri: vscode.Uri.file('/some/path/'),
        name: 'path',
        index: 1,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout2, 'source/folder/two')),
        name: 'two',
        index: 2,
      },
    ];
    cros.onUpdate();

    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalled();
    expect(cros.chroot()?.root).toEqual(
      // unchanged
      path.join(crosCheckout1, 'chroot') as Chroot
    );
  });

  it('rejects updates that would change a defined chroot (mutiple chroots)', async () => {
    const crosCheckout1 = path.join(temp.path, 'cros-1');
    await fs.promises.mkdir(crosCheckout1);
    await buildFakeChroot(crosCheckout1);

    const crosCheckout2 = path.join(temp.path, 'cros-2');
    await fs.promises.mkdir(crosCheckout2);
    await buildFakeChroot(crosCheckout2);

    const crosCheckout3 = path.join(temp.path, 'cros-3');
    await fs.promises.mkdir(crosCheckout3);
    await buildFakeChroot(crosCheckout3);

    (vscode.workspace as Mutable<typeof vscode.workspace>).workspaceFolders = [
      {
        uri: vscode.Uri.file('/some/path/'),
        name: 'path',
        index: 1,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout1, 'one/source/folder')),
        name: 'folder',
        index: 2,
      },
    ];
    const cros = new ChrootService(
      undefined,
      undefined,
      /* isInsideChroot = */ () => false
    );
    cros.onUpdate();

    expect(vscodeSpy.window.showErrorMessage).not.toHaveBeenCalled();
    expect(cros.chroot()?.root).toEqual(
      path.join(crosCheckout1, 'chroot') as Chroot
    );

    // Then change it (this is somewhat unrealistic,
    // as we would go through a step of having two chroots first).
    (vscode.workspace as Mutable<typeof vscode.workspace>).workspaceFolders = [
      {
        uri: vscode.Uri.file('/some/path/'),
        name: 'path',
        index: 1,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout2, 'source/folder/two')),
        name: 'two',
        index: 2,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout3, 'source/folder/three')),
        name: 'three',
        index: 3,
      },
    ];
    cros.onUpdate();

    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalled();
    expect(cros.chroot()?.root).toEqual(
      // unchanged
      path.join(crosCheckout1, 'chroot') as Chroot
    );
  });

  it('keeps the chroot stable if it was found before', async () => {
    const crosCheckout1 = path.join(temp.path, 'cros-1');
    await fs.promises.mkdir(crosCheckout1);
    await buildFakeChroot(crosCheckout1);

    const crosCheckout2 = path.join(temp.path, 'cros-2');
    await fs.promises.mkdir(crosCheckout2);
    await buildFakeChroot(crosCheckout2);

    (vscode.workspace as Mutable<typeof vscode.workspace>).workspaceFolders = [
      {
        uri: vscode.Uri.file('/some/path/'),
        name: 'path',
        index: 1,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout1, 'folder-A/')),
        name: 'folder-A',
        index: 2,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout2, 'folder-B/')),
        name: 'folder-B',
        index: 3,
      },
    ];
    const cros = new ChrootService(
      undefined,
      undefined,
      /* isInsideChroot = */ () => false
    );
    cros.onUpdate();
    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledTimes(1);

    expect(cros.chroot()?.root).toEqual(
      path.join(crosCheckout1, 'chroot') as Chroot
    );

    (vscode.workspace as Mutable<typeof vscode.workspace>).workspaceFolders = [
      {
        uri: vscode.Uri.file('/some/path/'),
        name: 'path',
        index: 1,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout2, 'folder-B/')),
        name: 'folder-B',
        index: 2,
      },
      {
        uri: vscode.Uri.file(path.join(crosCheckout1, 'folder-A/')),
        name: 'folder-A',
        index: 3,
      },
    ];

    cros.onUpdate();

    expect(cros.chroot()?.root).toEqual(
      path.join(crosCheckout1, 'chroot') as Chroot
    );
    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledTimes(3);
  });
});
