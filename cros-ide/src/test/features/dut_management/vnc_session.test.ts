// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import * as vnc from '../../../features/dut_management/vnc_session';
import * as webviewShared from '../../../features/dut_management/webview_shared';
import * as testing from '../../testing';
import {FakeSshServer} from './fake_ssh_server';
import {FakeVncServer} from './fake_vnc_server';

function waitConnectEvent(session: vnc.VncSession): Promise<void> {
  return new Promise<void>(resolve => {
    const subscription = session.onDidReceiveMessage(
      (message: webviewShared.ClientMessage) => {
        if (message.type === 'event' && message.subtype === 'connect') {
          subscription.dispose();
          resolve();
        }
      }
    );
  });
}

describe('VNC session', () => {
  const state = testing.cleanState(() => {
    const subscriptions: vscode.Disposable[] = [];
    const output = vscode.window.createOutputChannel(
      'CrOS IDE: DUT Manager (testing)'
    );
    subscriptions.push(output);
    return {subscriptions, output};
  });

  afterEach(() => {
    vscode.Disposable.from(...state.subscriptions).dispose();
  });

  it('can connect to a server', async () => {
    const api = await testing.activateExtension();

    // Start a fake VNC server.
    const vncServer = new FakeVncServer();
    state.subscriptions.push(vncServer);
    await vncServer.listen();

    // Start a fake SSH server.
    const sshServer = new FakeSshServer(vncServer.listenPort);
    state.subscriptions.push(sshServer);
    await sshServer.listen();

    // Prepare a VNC session.
    const session = new vnc.VncSession(
      `localhost:${sshServer.listenPort}`,
      api.context,
      state.output
    );
    state.subscriptions.push(session);

    const didConnect = waitConnectEvent(session);

    // Start a VNC session.
    session.start();

    // Ensure a successful connection event.
    await didConnect;
  });

  it('can connect to a server with message passing protocol', async () => {
    const api = await testing.activateExtension();

    // Start a fake VNC server.
    const vncServer = new FakeVncServer();
    state.subscriptions.push(vncServer);
    await vncServer.listen();

    // Start a fake SSH server.
    const sshServer = new FakeSshServer(vncServer.listenPort);
    state.subscriptions.push(sshServer);
    await sshServer.listen();

    // Prepare a VNC session.
    const session = new vnc.VncSession(
      `localhost:${sshServer.listenPort}`,
      api.context,
      state.output,
      vnc.ProxyProtocol.MESSAGE_PASSING // force message passing protocol
    );
    state.subscriptions.push(session);

    const didConnect = waitConnectEvent(session);

    // Start a VNC session.
    session.start();

    // Ensure a successful connection event.
    await didConnect;
  });
});
