// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as vscode from 'vscode';
import {
  GdbShimServer,
  GdbShimServerStarter,
} from '../../../../../features/device_management/commands/remote_debug/gdb_shim_server';
import {RemoteDebug} from '../../../../../features/device_management/commands/remote_debug/remote_debug';
import * as testing from '../../../../testing';
import {FakeDevice} from './fake_device';

describe('Remote debug', () => {
  const tempDir = testing.tempDir();
  const {vscodeSpy} = testing.installVscodeDouble();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.splice(0).reverse()).dispose();
  });

  it('launch works', async () => {
    const gdbShimServer = {
      port: 1234,
      onClose(_callback: () => void) {},
    } as GdbShimServer;

    const gdbArgs: string[][] = [];
    const gdbShimServerStarter = {
      start(args: string[]) {
        gdbArgs.push(args);
        return Promise.resolve(gdbShimServer);
      },
    } as GdbShimServerStarter;

    const device = new FakeDevice({
      executablesWithDebugSymbols: ['/usr/bin/codelab'],
      board: 'brya',
      port: 2222,
    });

    vscodeSpy.window.showQuickPick.and.returnValue({
      label: 'launch',
    });

    const quickPick = new testing.fakes.FakeQuickPick();
    vscodeSpy.window.createQuickPick.and.returnValue(quickPick);
    quickPick.onDidShow(() => {
      expect(quickPick.items).toEqual([
        {
          label: '/usr/bin/codelab',
        },
      ]);
      quickPick.activeItems = [quickPick.items[0]];
      quickPick.accept();
    });

    let config = {} as vscode.DebugConfiguration;
    vscodeSpy.debug.startDebugging.and.callFake(async (_folder, cfg) => {
      config = cfg as vscode.DebugConfiguration;
      return true;
    });

    await new RemoteDebug(device, gdbShimServerStarter, tempDir.path).run();

    expect(config).toEqual(
      jasmine.objectContaining({
        name: 'Debug /usr/bin/codelab',
        type: 'gdb',
        request: 'attach',
        target: jasmine.stringMatching(
          /^| ssh .* root@localhost -p 2222 gdbserver - \/usr\/bin\/codelab$/
        ),
        remote: true,
        cwd: jasmine.anything(),
      })
    );

    expect(gdbArgs).toEqual([
      jasmine.arrayContaining([
        '--init-eval-command',
        'file /build/brya/usr/bin/codelab',
      ]),
    ]);

    const program = await fs.promises.readFile(config.gdbpath, 'utf8');
    expect(program).toContain('1234');
  });
});
