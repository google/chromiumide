// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {activateSingle} from '../../features/suggest_extension';
import {flushMicrotasks} from '../testing';
import {installVscodeDouble} from './doubles';

describe('Suggest extension module', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();

  it('suggests an extension', async () => {
    await activateSingle({
      languageId: 'cpp',
      extensionId: 'foo',
      message: 'It is recommended to install Foo extension for C++. Proceed?',
    });

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
    await activateSingle({
      languageId: 'cpp',
      extensionId: 'foo',
      message: 'It is recommended to install Foo extension for C++. Proceed?',
    });

    vscodeEmitters.window.onDidChangeActiveTextEditor.fire({
      document: {
        languageId: 'gn',
      },
    } as vscode.TextEditor);

    expect(vscodeSpy.window.showInformationMessage).not.toHaveBeenCalled();
  });
});
