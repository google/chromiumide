// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {CodeServer} from '../../../features/code_server';
import {EventReader, installVscodeDouble} from '../../testing';

describe('CodeServer', () => {
  const {vscodeGetters, vscodeSpy} = installVscodeDouble();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.splice(0)).dispose();
  });

  it('suggests migration on code-server', async () => {
    vscodeGetters.env.appName.and.returnValue('code-server');

    const codeServer = new CodeServer();
    subscriptions.push(codeServer);

    vscodeSpy.window.showErrorMessage.and.returnValue('Open guide');

    const reader = new EventReader(codeServer.onDidRun, subscriptions);
    expect(await reader.read()).toEqual({
      suggestMigration: true,
    });

    expect(vscodeSpy.env.openExternal).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        path: '/chromiumide-on-chromebooks',
      })
    );
  });

  it('does nothing on vscode', async () => {
    vscodeGetters.env.appName.and.returnValue('Visual Studio Code');

    const codeServer = new CodeServer();
    subscriptions.push(codeServer);

    const reader = new EventReader(codeServer.onDidRun, subscriptions);
    expect(await reader.read()).toEqual({
      suggestMigration: false,
    });
  });
});
