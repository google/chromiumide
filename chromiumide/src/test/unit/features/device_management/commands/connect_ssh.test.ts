// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as childProcess from 'child_process';
import * as vscode from 'vscode';
import {escapeArray} from '../../../../../../shared/app/common/shutil';
import {findUnusedPort, isPortUsed} from '../../../../../common/net_util';
import {processExists} from '../../../../../common/processes';
import {CommandContext} from '../../../../../features/device_management/commands/common';
import {connectToDeviceForShell} from '../../../../../features/device_management/commands/connect_ssh';
import {SshIdentity} from '../../../../../features/device_management/ssh_identity';
import * as testing from '../../../../testing';

describe('SSH command', () => {
  const {vscodeSpy, vscodeEmitters} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const fakeExec = testing.installFakeExec();

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
    const onDidShowPickerEmitter = new vscode.EventEmitter<void>();
    const onDidShowPicker = new testing.EventReader(
      onDidShowPickerEmitter.event
    );
    subscriptions.push(
      onDidFinishEmitter,
      onDidFinish,
      onDidShowPickerEmitter,
      onDidShowPicker
    );

    return {
      context,
      terminal,
      onDidFinishEmitter,
      onDidFinish,
      onDidShowPickerEmitter,
      onDidShowPicker,
    };
  });

  it('runs ssh command to connect to the device', async () => {
    vscodeSpy.window.createTerminal.and.returnValue(state.terminal);

    await connectToDeviceForShell(
      state.context,
      'fakehost',
      /* withOptions = */ false,
      {
        onDidFinishEmitter: state.onDidFinishEmitter,
      }
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
        label: '-4',
      },
    ];
    vscodeSpy.window.createTerminal.and.returnValue(state.terminal);

    const command = connectToDeviceForShell(state.context, 'fakehost', true, {
      onDidFinishEmitter: state.onDidFinishEmitter,
      onDidShowPickerEmitter: state.onDidShowPickerEmitter,
    });

    await state.onDidShowPicker.read();
    picker.accept();

    await command;

    vscodeEmitters.window.onDidCloseTerminal.fire(state.terminal);

    await state.onDidFinish.read();

    expect(state.terminal.getTexts()).toEqual(
      'exec ssh -i /path/to/identity/file -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -4 root@fakehost\n'
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

      const command = connectToDeviceForShell(state.context, 'fakehost', true, {
        onDidFinishEmitter: state.onDidFinishEmitter,
        onDidShowPickerEmitter: state.onDidShowPickerEmitter,
      });

      await state.onDidShowPicker.read();
      picker.accept();

      await command;

      vscodeEmitters.window.onDidCloseTerminal.fire(state.terminal);

      await state.onDidFinish.read();

      expect(state.terminal.getTexts()).toContain(
        escapeArray(testCase.wantExtraOptions)
      );
    });
  }

  it('with options checks used port and suggests to kill it', async () => {
    const picker = new testing.fakes.FakeQuickPick();
    subscriptions.push(picker);

    const port = await findUnusedPort();

    vscodeSpy.window.createQuickPick.and.returnValue(picker);
    picker.activeItems = [
      {
        label: `-L ${port}:localhost:1234`,
      },
    ];

    const processUsingPort = childProcess.spawn(
      'nc',
      ['-v', '-l', 'localhost', `${port}`],
      {stdio: 'pipe'}
    );
    await new Promise(resolve => processUsingPort.stderr!.on('data', resolve));

    expect(await isPortUsed(port)).toBeTrue();

    const pid = processUsingPort.pid!;

    // We could rely on real lsof here, but it is not efficient (can take 250ms).
    fakeExec.installStdout(
      'lsof',
      ['-i', `tcp:${port}`, '-s', 'tcp:listen', '-F', 'cp'],
      `p${pid}
cnc
`
    );

    vscodeSpy.window.showWarningMessage.and.returnValue('Kill nc');

    vscodeSpy.window.createTerminal.and.returnValue(state.terminal);

    const command = connectToDeviceForShell(state.context, 'fakehost', true, {
      onDidFinishEmitter: state.onDidFinishEmitter,
      onDidShowPickerEmitter: state.onDidShowPickerEmitter,
      pollInterval: 10,
    });

    await state.onDidShowPicker.read();
    picker.accept();

    await command;

    vscodeEmitters.window.onDidCloseTerminal.fire(state.terminal);

    await state.onDidFinish.read();

    expect(processExists(pid)).toBeFalse();

    expect(state.terminal.getTexts()).toEqual(
      `exec ssh -i /path/to/identity/file -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -L ${port}:localhost:1234 root@fakehost\n`
    );

    expect(processExists(pid)).toBeFalse();
  });
});
