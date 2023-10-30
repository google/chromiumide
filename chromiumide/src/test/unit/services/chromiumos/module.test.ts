// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as path from 'path';
import * as vscode from 'vscode';
import {ChromiumosServiceModule} from '../../../../services/chromiumos/module';
import * as testing from '../../../testing';

describe('ChromiumosServiceModule', () => {
  const tempDir = testing.tempDir();

  const {vscodeGetters} = testing.installVscodeDouble();

  it('sends event after constructor returns', async () => {
    await testing.buildFakeChroot(tempDir.path);

    vscodeGetters.workspace.workspaceFolders.and.returnValue([
      {
        uri: vscode.Uri.file(path.join(tempDir.path, 'foo')),
        name: path.join(tempDir.path, 'foo'),
      } as vscode.WorkspaceFolder,
    ]);

    const module = new ChromiumosServiceModule();
    const events = new testing.EventReader(module.onDidUpdate);

    const {root, chrootService} = (await events.read())!;

    expect(root).toEqual(tempDir.path);
    expect(chrootService!.chroot.root).toEqual(
      path.join(tempDir.path, 'chroot')
    );
  });
});
