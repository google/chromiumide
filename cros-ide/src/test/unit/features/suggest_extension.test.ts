// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Metrics} from '../../../features/metrics/metrics';
import {activateSingle} from '../../../features/suggest_extension';
import {flushMicrotasks} from '../../testing';
import {installVscodeDouble} from '../../testing/doubles';

describe('Suggest extension module', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  const subscriptions: vscode.Disposable[] = [];

  beforeEach(() => {
    vscodeSpy.commands.registerCommand('extension.open', () => {});
    vscodeSpy.commands.registerCommand(
      'workbench.extensions.installExtension',
      () => {}
    );

    vscode.Disposable.from(...subscriptions).dispose();
    subscriptions.splice(0);
    spyOn(Metrics, 'send');
  });

  it('suggests an extension', async () => {
    subscriptions.push(
      activateSingle(
        {
          languageIds: ['cpp'],
          extensionId: 'foo',
          message:
            'It is recommended to install Foo extension for C++. Proceed?',
          availableForCodeServer: true,
        },
        false /* isCodeServer */
      )
    );

    vscodeSpy.window.showInformationMessage
      .withArgs(
        'It is recommended to install Foo extension for C++. Proceed?',
        'Yes',
        'Later'
      )
      .and.returnValue('Yes');

    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        languageId: 'cpp',
      },
    } as vscode.TextEditor);

    await flushMicrotasks();

    expect(vscodeSpy.commands.executeCommand).toHaveBeenCalledWith(
      'extension.open',
      'foo'
    );
    expect(vscodeSpy.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.extensions.installExtension',
      'foo'
    );
    expect(Metrics.send).toHaveBeenCalledTimes(2);
    expect(Metrics.send).toHaveBeenCalledWith({
      category: 'background',
      group: 'misc',
      description: 'show suggestion',
      name: 'misc_suggested_extension',
      extension: 'foo',
    });
    expect(Metrics.send).toHaveBeenCalledWith({
      category: 'interactive',
      group: 'misc',
      description: 'install suggested',
      name: 'misc_installed_suggested_extension',
      extension: 'foo',
    });
  });

  it('does not suggest if languages do not match', async () => {
    activateSingle(
      {
        languageIds: ['cpp'],
        extensionId: 'foo',
        message: 'It is recommended to install Foo extension for C++. Proceed?',
        availableForCodeServer: true,
      },
      false /* isCodeServer */
    );

    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        languageId: 'gn',
      },
    } as vscode.TextEditor);

    expect(vscodeSpy.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('does not suggest extension not available for code-server', async () => {
    subscriptions.push(
      activateSingle(
        {
          languageIds: ['gn'],
          extensionId: 'msedge-dev.gnls',
          message:
            'GN Language Server extension provides syntax highlighting and code navigation for GN build files. ' +
            'Would you like to install it?',
          availableForCodeServer: false,
        },
        true /* isCodeServer */
      )
    );

    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        languageId: 'gn',
      },
    } as vscode.TextEditor);

    expect(vscodeSpy.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('does not suggest the same extension twice', async () => {
    subscriptions.push(
      activateSingle(
        {
          languageIds: ['cpp'],
          extensionId: 'foo',
          message:
            'It is recommended to install Foo extension for C++. Proceed?',
          availableForCodeServer: true,
        },
        false /* isCodeServer */
      )
    );

    vscodeSpy.window.showInformationMessage
      .withArgs(
        'It is recommended to install Foo extension for C++. Proceed?',
        'Yes',
        'Later'
      )
      .and.returnValues('Later');

    // Trigger three times.
    for (let i = 0; i < 3; i++) {
      vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
        document: {
          languageId: 'cpp',
        },
      } as vscode.TextEditor);
    }

    await flushMicrotasks();

    // Suggestion should be shown exactly once.
    expect(vscodeSpy.window.showInformationMessage.calls.count()).toEqual(1);
  });
});
