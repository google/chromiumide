// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import {SshIdentity} from '../../../../../features/device_management/ssh_identity';
import * as vnc from '../../../../../features/device_management/vnc_session';
import * as webviewShared from '../../../../../features/device_management/webview_shared';
import {ChromiumosServiceModule} from '../../../../../services/chromiumos';
import * as testing from '../../../../testing';
import * as extensionTesting from '../../../extension_testing';
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
      'ChromiumIDE: Device Management (testing)'
    );
    subscriptions.push(output);
    return {subscriptions, output};
  });

  afterEach(() => {
    vscode.Disposable.from(...state.subscriptions).dispose();
  });

  it('can connect to a server', async () => {
    const api = await extensionTesting.activateExtension();

    // Start a fake VNC server.
    const vncServer = new FakeVncServer();
    state.subscriptions.push(vncServer);
    await vncServer.listen();

    // Start a fake SSH server.
    const sshServer = new FakeSshServer(vncServer.listenPort);
    state.subscriptions.push(sshServer);
    await sshServer.listen();

    // Prepare a VNC session.
    const session = await vnc.VncSession.create(
      `localhost:${sshServer.listenPort}`,
      api.context,
      state.output,
      new SshIdentity(api.context.extensionUri, new ChromiumosServiceModule()),
      false
    );
    state.subscriptions.push(session);

    const didConnect = waitConnectEvent(session);

    // Start a VNC session.
    await session.start();

    // Ensure a successful connection event.
    await didConnect;
  });

  it('can connect to a server with message passing protocol', async () => {
    const api = await extensionTesting.activateExtension();

    // Start a fake VNC server.
    const vncServer = new FakeVncServer();
    state.subscriptions.push(vncServer);
    await vncServer.listen();

    // Start a fake SSH server.
    const sshServer = new FakeSshServer(vncServer.listenPort);
    state.subscriptions.push(sshServer);
    await sshServer.listen();

    // Prepare a VNC session.
    const session = await vnc.VncSession.create(
      `localhost:${sshServer.listenPort}`,
      api.context,
      state.output,
      new SshIdentity(api.context.extensionUri, new ChromiumosServiceModule()),
      false,
      vnc.ProxyProtocol.MESSAGE_PASSING // force message passing protocol
    );
    state.subscriptions.push(session);

    const didConnect = waitConnectEvent(session);

    // Start a VNC session.
    await session.start();

    // Ensure a successful connection event.
    await didConnect;
  });
});
