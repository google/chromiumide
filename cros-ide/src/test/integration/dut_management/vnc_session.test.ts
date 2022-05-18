// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import * as vnc from '../../../features/dut_management/vnc_session';
import * as testing from '../../testing';
import {FakeSshServer} from './fake_ssh_server';
import {FakeVncServer} from './fake_vnc_server';

describe('VNC session', () => {
  const subscriptions: vscode.Disposable[] = [];

  afterEach(() => {
    vscode.Disposable.from(...subscriptions).dispose();
    subscriptions.splice(0);
  });

  it('can connect to a server', async () => {
    const api = await testing.activateExtension();

    // Start a fake VNC server.
    const vncServer = new FakeVncServer();
    subscriptions.push(vncServer);
    await vncServer.listen();

    // Start a fake SSH server.
    const sshServer = new FakeSshServer(vncServer.listenPort);
    subscriptions.push(sshServer);
    await sshServer.listen();

    // Prepare a VNC session.
    const session = new vnc.VncSession(
      `localhost:${sshServer.listenPort}`,
      api.context
    );
    subscriptions.push(session);

    const didConnect = new Promise<void>(resolve => {
      const subscription = session.onDidReceiveMessage((message: unknown) => {
        if (
          typeof message === 'object' &&
          (message as {type: string} | null)?.type === 'connect'
        ) {
          subscription.dispose();
          resolve();
        }
      });
    });

    // Start a VNC session.
    session.start();

    // Ensure a successful connection event.
    await didConnect;
  });
});
