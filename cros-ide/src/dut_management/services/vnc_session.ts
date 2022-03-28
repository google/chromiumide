// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Represents a VNC Session
 */
import * as vscode from 'vscode';
import * as ideutil from '../../ide_utilities';

export class VncSession {
  private static nextAvailablePort = 6080;

  private readonly localPort: number;
  private readonly terminal: vscode.Terminal;
  private readonly panel: vscode.WebviewPanel;
  private disposed = false;

  private onDidDisposeEmitter = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.onDidDisposeEmitter.event;

  constructor(private readonly host: string,
    readonly context: vscode.ExtensionContext) {
    // Here we do the following:
    // 1. Choose a local port
    // 2. Start an SSH session for SSH tunnel and to start kmsvnc and novnc
    // 3. Create tab to display VNC contents
    this.localPort = VncSession.nextAvailablePort++;
    this.terminal =
      VncSession.startVncServer(host, this.localPort, context);
    this.panel = VncSession.createWebview(host, this.localPort);

    // Dispose the session when the panel is closed.
    this.panel.onDidDispose(() => {
      this.dispose();
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    this.terminal.dispose();
    this.panel.dispose();
    this.onDidDisposeEmitter.fire();
  }

  revealPanel(): void {
    this.panel.reveal();
  }

  private static startVncServer(host: string, localPort: number,
      context: vscode.ExtensionContext): vscode.Terminal {
    const terminal = ideutil.createTerminalForHost(host,
        'CrOS: VNC forwarding', context, `-L ${localPort}:localhost:6080`);
    terminal.sendText('fuser -k 5900/tcp 6080/tcp');
    terminal.sendText('kmsvnc &');
    terminal.sendText('novnc &');
    return terminal;
  }

  private static createWebview(
      host: string, localPort: number): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
        'vncclient',
        `CrOS VNC Client: ${host}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          // https://code.visualstudio.com/api/extension-guides/webview#retaincontextwhenhidden
          retainContextWhenHidden: true,
        },
    );
    panel.webview.html = VncSession.getWebviewContent(localPort);
    return panel;
  }

  private static getWebviewContent(localPort: number) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CrOS VNC Client</title>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          height: 100%;
        }
        #main {
          border: 0;
          width: 100%;
          height: 100%;
        }
      </style>
    </head>
    <body>
      <iframe
        id="main"
        title="iframe"
        sandbox="allow-scripts allow-same-origin">
      </iframe>
      <script>
        // Navigate after 5 seconds.
        setTimeout(() => {
          document.getElementById('main').src =
              'http://localhost:${localPort}/vnc.html?resize=scale&autoconnect=true';
        }, 5000);
      </script>
    </body>
    </html>`;
  }
}
