// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import path from 'path';
import * as vscode from 'vscode';
import * as hints from '../../../features/hints';
import * as testing from '../../testing';

describe('hints', () => {
  const tempDir = testing.tempDir();

  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.splice(0);
  });

  it('should warn if chromiumos is workspace folder', async () => {
    await testing.buildFakeChroot(tempDir.path);

    hints.activate({subscriptions} as vscode.ExtensionContext);

    const subdir = vscode.Uri.file(path.join(tempDir.path, 'sub'));

    vscodeSpy.window.showWarningMessage.and.returnValue('Open subdirectory');
    vscodeSpy.window.showOpenDialog.and.resolveTo([subdir]);
    vscodeSpy.commands.executeCommand.and.resolveTo();

    vscodeEmitters.workspace.onDidChangeWorkspaceFolders.fire({
      added: [
        {
          uri: vscode.Uri.file(tempDir.path),
        } as vscode.WorkspaceFolder,
      ],
      removed: [],
    });

    await new testing.EventReader(
      hints.onDidHandleChangeWorkspaceFolders,
      subscriptions
    ).read();

    expect(vscodeSpy.commands.executeCommand).toHaveBeenCalledOnceWith(
      'vscode.openFolder',
      subdir
    );
  });

  it('should not warn if chromiumos/src is workspace folder', async () => {
    await testing.buildFakeChroot(tempDir.path);

    hints.activate({subscriptions} as vscode.ExtensionContext);

    const subdir = vscode.Uri.file(path.join(tempDir.path, 'src'));

    vscodeEmitters.workspace.onDidChangeWorkspaceFolders.fire({
      added: [
        {
          uri: subdir,
        } as vscode.WorkspaceFolder,
      ],
      removed: [],
    });

    await new testing.EventReader(
      hints.onDidHandleChangeWorkspaceFolders,
      subscriptions
    ).read();

    expect(vscodeSpy.window.showWarningMessage).toHaveBeenCalledTimes(0);
  });

  it('should not warn chromiumos workspace folder if user requests', async () => {
    await testing.buildFakeChroot(tempDir.path);

    hints.activate({subscriptions} as vscode.ExtensionContext);

    vscodeSpy.window.showWarningMessage.and.returnValue("Don't ask again");

    const event = {
      added: [
        {
          uri: vscode.Uri.file(tempDir.path),
        } as vscode.WorkspaceFolder,
      ],
      removed: [],
    };

    const reader = new testing.EventReader(
      hints.onDidHandleChangeWorkspaceFolders,
      subscriptions
    );

    vscodeEmitters.workspace.onDidChangeWorkspaceFolders.fire(event);

    await reader.read();

    vscodeEmitters.workspace.onDidChangeWorkspaceFolders.fire(event);

    await reader.read();

    expect(vscodeSpy.window.showWarningMessage).toHaveBeenCalledTimes(1);
  });
});
