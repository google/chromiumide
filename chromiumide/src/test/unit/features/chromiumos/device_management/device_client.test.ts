// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as deviceClient from '../../../../../features/device_management/device_client';
import {SshIdentity} from '../../../../../features/device_management/ssh_identity';
import {ChromiumosServiceModule} from '../../../../../services/chromiumos';
import * as testing from '../../../../testing';
import {FakeSshServer} from './fake_ssh_server';

describe('Device client', () => {
  testing.installVscodeDouble();

  const state = testing.cleanState(async () => {
    const server = new FakeSshServer();
    await server.listen();
    const client = new deviceClient.DeviceClient(
      `localhost:${server.listenPort}`,
      new SshIdentity(testing.getExtensionUri(), new ChromiumosServiceModule()),
      vscode.window.createOutputChannel('void')
    );
    return {server, client};
  });

  afterEach(async () => {
    state.server.dispose();
  });

  it('reads /etc/lsb-release', async () => {
    const lsbRelease = await state.client.readLsbRelease();
    expect(lsbRelease).toEqual({
      board: 'hatch',
      builderPath: 'hatch-release/R104-14901.0.0',
    });
  });
});
