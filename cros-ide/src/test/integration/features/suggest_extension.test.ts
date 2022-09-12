// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {activateSingle} from '../../../features/suggest_extension';
import {flushMicrotasks} from '../../testing';
import {installVscodeDouble} from '../doubles';

describe('Suggest extension module', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  const subscriptions: vscode.Disposable[] = [];

  beforeEach(() => {
    vscode.Disposable.from(...subscriptions).dispose();
    subscriptions.splice(0);
  });

  it('suggests an extension', async () => {
    subscriptions.push(
      activateSingle(
        {
          languageId: 'cpp',
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
  });

  it('does not suggest if languages do not match', async () => {
    activateSingle(
      {
        languageId: 'cpp',
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
          languageId: 'gn',
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
          languageId: 'cpp',
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
