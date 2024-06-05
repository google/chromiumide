// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {escapeArray} from '../../../../../../shared/app/common/shutil';
import {CommandContext} from '../../../../../features/device_management/commands/common';
import {
  connectToDeviceForShell,
  connectToDeviceForShellWithOptions,
} from '../../../../../features/device_management/commands/connect_ssh';
import {SshIdentity} from '../../../../../features/device_management/ssh_identity';
import * as testing from '../../../../testing';

describe('SSH command', () => {
  const {vscodeSpy, vscodeEmitters} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.splice(0).reverse()).dispose();
  });

  const state = testing.cleanState(() => {
    const context = {
      sshIdentity: {
        filePaths: ['/path/to/identity/file'],
      } as SshIdentity,
    } as CommandContext;

    const terminal = new testing.fakes.FakeTerminal();
    subscriptions.push(terminal);

    const onDidFinishEmitter = new vscode.EventEmitter<void>();
    const onDidFinish = new testing.EventReader(onDidFinishEmitter.event);
    subscriptions.push(onDidFinishEmitter, onDidFinish);

    return {
      context,
      terminal,
      onDidFinishEmitter,
      onDidFinish,
    };
  });

  it('runs ssh command to connect to the device', async () => {
    vscodeSpy.window.createTerminal.and.returnValue(state.terminal);

    await connectToDeviceForShell(
      state.context,
      'fakehost',
      /* extraOptions = */ undefined,
      state.onDidFinishEmitter
    );

    vscodeEmitters.window.onDidCloseTerminal.fire(state.terminal);

    await state.onDidFinish.read();

    expect(state.terminal.getTexts()).toEqual(
      'exec ssh -i /path/to/identity/file -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@fakehost\n'
    );
  });

  it('with options parses user input and runs command', async () => {
    const picker = new testing.fakes.FakeQuickPick();
    subscriptions.push(picker);

    vscodeSpy.window.createQuickPick.and.returnValue(picker);
    picker.activeItems = [
      {
        label: '-L 1234:localhost:1234',
      },
    ];

    vscodeSpy.window.createTerminal.and.returnValue(state.terminal);

    const command = connectToDeviceForShellWithOptions(
      state.context,
      'fakehost',
      state.onDidFinishEmitter
    );

    picker.accept();

    await command;

    vscodeEmitters.window.onDidCloseTerminal.fire(state.terminal);

    await state.onDidFinish.read();

    expect(state.terminal.getTexts()).toEqual(
      'exec ssh -i /path/to/identity/file -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -L 1234:localhost:1234 root@fakehost\n'
    );
  });

  for (const testCase of [
    {
      name: 'parses -p22',
      input: '-p22',
      wantExtraOptions: ['-p', '22'],
    },
    {
      name: 'parses multipe options with quotes',
      input: '-p22 -i "/path/with/space and quotes\'\\"" -4',
      wantExtraOptions: [
        '-p',
        '22',
        '-i',
        '/path/with/space and quotes\'"',
        '-4',
      ],
    },
  ]) {
    it(testCase.name, async () => {
      const picker = new testing.fakes.FakeQuickPick();
      subscriptions.push(picker);

      vscodeSpy.window.createQuickPick.and.returnValue(picker);
      picker.activeItems = [
        {
          label: testCase.input,
        },
      ];

      vscodeSpy.window.createTerminal.and.returnValue(state.terminal);

      const command = connectToDeviceForShellWithOptions(
        state.context,
        'fakehost',
        state.onDidFinishEmitter
      );

      picker.accept();

      await command;

      vscodeEmitters.window.onDidCloseTerminal.fire(state.terminal);

      await state.onDidFinish.read();

      expect(state.terminal.getTexts()).toContain(
        escapeArray(testCase.wantExtraOptions)
      );
    });
  }
});
