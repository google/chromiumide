// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../../../../common/vscode/commands';
import * as testing from '../../../testing';

describe('vscodeRegisterCommand', () => {
  const {vscodeSpy} = testing.installVscodeDouble();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.splice(0).reverse()).dispose();
  });

  it('passes callback to vscode API transparently', async () => {
    subscriptions.push(
      vscodeRegisterCommand('pass', () => 'ok'),
      vscodeRegisterCommand('fail', () => {
        throw new Error('err');
      }),
      vscodeRegisterCommand('async-pass', () => Promise.resolve('ok')),
      vscodeRegisterCommand('async-fail', () =>
        Promise.reject(new Error('err'))
      )
    );

    expect(await vscode.commands.executeCommand('pass')).toEqual('ok');
    expect(await vscode.commands.executeCommand('async-pass')).toEqual('ok');

    await expectAsync(
      vscode.commands.executeCommand('fail')
    ).toBeRejectedWithError('err');
    await expectAsync(
      vscode.commands.executeCommand('async-fail')
    ).toBeRejectedWithError('err');

    // Test commands are unregistered on dispose.
    const ephemeralCommand = vscodeRegisterCommand('ephemeral', () => '');
    ephemeralCommand.dispose();

    await expectAsync(
      vscode.commands.executeCommand('ephemeral')
    ).toBeRejected();
  });

  it('shows ignorable error on failure', async () => {
    subscriptions.push(
      vscodeRegisterCommand('foo', async () => {
        throw new Error('err');
      }),
      vscodeRegisterCommand('bar', async () => {
        throw new Error('err2');
      })
    );

    vscodeSpy.window.showErrorMessage.and.resolveTo(undefined);

    await expectAsync(vscode.commands.executeCommand('foo')).toBeRejected();
    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledTimes(1);

    vscodeSpy.window.showErrorMessage
      .withArgs('Command foo failed: Error: err', 'Ignore')
      .and.resolveTo('Ignore');

    await expectAsync(vscode.commands.executeCommand('foo')).toBeRejected();
    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledTimes(2);

    // Error is not shown after the user instructs to ignore it.
    await expectAsync(vscode.commands.executeCommand('foo')).toBeRejected();
    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledTimes(2);
    // Error is still shown for irrelevant command.
    await expectAsync(vscode.commands.executeCommand('bar')).toBeRejected();
    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledTimes(3);

    // Unregister and register command again.
    vscode.Disposable.from(...subscriptions.splice(0).reverse()).dispose();
    subscriptions.push(
      vscodeRegisterCommand('foo', async () => {
        throw new Error('err');
      })
    );

    // Error is shown again.
    await expectAsync(vscode.commands.executeCommand('foo')).toBeRejected();
    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledTimes(4);
  });
});
