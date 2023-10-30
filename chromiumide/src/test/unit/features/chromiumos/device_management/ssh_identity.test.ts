// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {SshIdentity} from '../../../../../features/device_management/ssh_identity';
import {ChromiumosServiceModule} from '../../../../../services/chromiumos';
import * as testing from '../../../../testing';

describe('SSH identity', () => {
  const tempDir = testing.tempDir();

  const {vscodeGetters} = testing.installVscodeDouble();

  it('returns partner testing rsa when available', async () => {
    const chromiumos = tempDir.path;

    await testing.buildFakeChroot(chromiumos);

    // Open a folder under chromiumos root
    vscodeGetters.workspace.workspaceFolders.and.returnValue([
      {
        uri: vscode.Uri.file(path.join(chromiumos, 'foo')),
        name: path.join(chromiumos, 'foo'),
      } as vscode.WorkspaceFolder,
    ]);

    const module = new ChromiumosServiceModule();

    const sshIdentity = new SshIdentity(
      vscode.Uri.parse('file:///path/to/extension'),
      module
    );

    const events = new testing.EventReader(module.onDidUpdate);
    await events.read();
    events.dispose();

    expect(sshIdentity.filePaths).toEqual([
      '/path/to/extension/resources/testing_rsa',
      path.join(chromiumos, 'sshkeys/partner_testing_rsa'),
    ]);
  });
});
