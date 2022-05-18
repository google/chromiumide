// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as ws from 'ws';
import * as dutUtil from './dut_util';

/**
 * Represents an active VNC session of a DUT.
 *
 * It manages UI resources associated to a VNC session, such as a vscode.Terminal used to start and
 * forward KMSVNC server on the DUT, and a vscode.WebViewPanel to render NoVNC UI on.
 *
 * It also starts a local WebSocket server which acts as a protocol proxy between the NoVNC client
 * and the KMSVNC server, since NoVNC on WebView cannot directly speak VNC protocol.
 *
 * The WebView is initially empty. Call start() to start WebView, possibly after subscribing to
 * some events.
 *
 * Call dispose() to destroy the session programmatically. It is also called when the user closes
 * the WebView panel.
 */
export class VncSession {
  private static readonly KMSVNC_PORT = 5900;

  // Tracks the next port number to use for SSH port forwarding.
  // TODO: Think of a better way to find an unused port.
  private static nextAvailablePort = 55900;

  private readonly terminal: vscode.Terminal;
  private readonly panel: vscode.WebviewPanel;
  private readonly proxy: WebSocketProxy;

  private readonly onDidDisposeEmitter = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.onDidDisposeEmitter.event;

  private readonly onDidReceiveMessageEmitter =
    new vscode.EventEmitter<unknown>();
  readonly onDidReceiveMessage = this.onDidReceiveMessageEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    // onDidDisposeEmitter is not listed here so we can fire it after disposing everything else.
    this.onDidReceiveMessageEmitter,
  ];

  constructor(host: string, private readonly context: vscode.ExtensionContext) {
    const forwardPort = VncSession.nextAvailablePort++;
    this.terminal = VncSession.startVncServer(host, forwardPort, context);
    this.panel = VncSession.createWebview(host);
    this.proxy = new WebSocketProxy(forwardPort);

    this.subscriptions.push(this.terminal, this.panel, this.proxy);

    this.subscriptions.push(
      this.panel.webview.onDidReceiveMessage((msg: unknown) => {
        this.onDidReceiveMessageEmitter.fire(msg);
      })
    );

    // Dispose the session when the panel is closed.
    this.subscriptions.push(
      this.panel.onDidDispose(() => {
        this.dispose();
      })
    );
  }

  start(): void {
    VncSession.startWebview(
      this.panel.webview,
      this.proxy.listenPort,
      this.context
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
    this.onDidDisposeEmitter.fire();
    this.onDidDisposeEmitter.dispose();
  }

  revealPanel(): void {
    this.panel.reveal();
  }

  private static startVncServer(
    host: string,
    forwardPort: number,
    context: vscode.ExtensionContext
  ): vscode.Terminal {
    const terminal = dutUtil.createTerminalForHost(
      host,
      'CrOS: VNC Server',
      context,
      ['-L', `${forwardPort}:localhost:${VncSession.KMSVNC_PORT}`]
    );
    // Stop an existing server if any.
    terminal.sendText(`fuser -k ${VncSession.KMSVNC_PORT}/tcp; kmsvnc`);
    return terminal;
  }

  private static createWebview(host: string): vscode.WebviewPanel {
    return vscode.window.createWebviewPanel(
      'vncclient',
      `VNC: ${host}`,
      vscode.ViewColumn.One,
      {
        // Scripting is needed to run NoVNC.
        enableScripts: true,
        // Retain the content even if the tab is not visible.
        // https://code.visualstudio.com/api/extension-guides/webview#retaincontextwhenhidden
        retainContextWhenHidden: true,
      }
    );
  }

  private static async startWebview(
    webview: vscode.Webview,
    proxyPort: number,
    context: vscode.ExtensionContext
  ): Promise<void> {
    // Call asExternalUri with http:// URL to set up port forwarding
    // in the case of remote development.
    // https://code.visualstudio.com/api/advanced-topics/remote-extensions#option-1-use-asexternaluri
    const proxyHttpUrl = await vscode.env.asExternalUri(
      vscode.Uri.parse(`http://localhost:${proxyPort}/`)
    );
    const proxyUrl = proxyHttpUrl.with({scheme: 'ws'});
    webview.html = VncSession.getWebviewContent(webview, proxyUrl, context);
  }

  private static getWebviewContent(
    webview: vscode.Webview,
    proxyUrl: vscode.Uri,
    context: vscode.ExtensionContext
  ): string {
    const filePath = path.join(context.extensionPath, 'dist/views/vnc.html');
    const html = fs.readFileSync(filePath, {encoding: 'utf-8'});
    return replaceAll(html, [
      {
        from: /%EXTENSION_ROOT_URL%/g,
        to: webview.asWebviewUri(context.extensionUri).toString(),
      },
      {from: /%WEB_SOCKET_PROXY_URL%/g, to: proxyUrl.toString()},
    ]);
  }
}

// Represents a local WebSocket server which acts as a protocol proxy between the NoVNC client
// and the KMSVNC server.
// Specify a VNC server port on localhost to construct.
// It listens on an arbitrary unused TCP port on localhost. Read listenPort property to obtain
// the port number actually allocated.
class WebSocketProxy implements vscode.Disposable {
  private readonly server: ws.WebSocketServer;

  constructor(vncPort: number) {
    this.server = new ws.WebSocketServer({port: 0});
    this.server.on('connection', (downstream: ws.WebSocket) => {
      downstream.binaryType = 'nodebuffer';
      const upstream = net.createConnection(vncPort, 'localhost');

      upstream.on('error', (err: Error) => {
        console.error(err);
      });
      upstream.on('close', () => {
        downstream.close();
      });
      downstream.on('error', (err: Error) => {
        console.error(err);
      });
      downstream.on('close', () => {
        upstream.destroy();
      });

      upstream.on('connect', () => {
        upstream.on('data', (data: Buffer) => {
          downstream.send(data);
        });
        downstream.on('message', (data: Buffer) => {
          upstream.write(data);
        });
      });
    });
  }

  dispose(): void {
    this.server.close();
  }

  get listenPort(): number {
    return (this.server.address() as ws.AddressInfo).port;
  }
}

interface ReplacePattern {
  from: RegExp;
  to: string;
}

function replaceAll(s: string, patterns: ReplacePattern[]): string {
  for (const pattern of patterns) {
    s = s.replace(pattern.from, pattern.to);
  }
  return s;
}
