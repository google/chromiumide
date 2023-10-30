// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as vscode from 'vscode';
import * as ws from 'ws';
import * as commonUtil from '../../common/common_util';
import {MemoryOutputChannel} from '../../common/memory_output_channel';
import * as netUtil from '../../common/net_util';
import {TeeOutputChannel} from '../../common/tee_output_channel';
import {
  DiagnosedError,
  createShowLogsButton,
  diagnoseSshError,
  showErrorMessageWithButtons,
} from './diagnostic';
import {replaceAll} from './html_util';
import {SshIdentity} from './ssh_identity';
import * as sshUtil from './ssh_util';
import * as webviewShared from './webview_shared';

/**
 * Represents a protocol used between the WebView and localhost.
 */
export enum ProxyProtocol {
  WEBSOCKET,
  MESSAGE_PASSING,
}

/**
 * Represents an active VNC session of a device.
 *
 * It manages UI resources associated to a VNC session, such as a vscode.Terminal used to start and
 * forward KMSVNC server on the device, and a vscode.WebViewPanel to render NoVNC UI on.
 *
 * It also manages a proxy to allow the WebView to connect to the VNC server. There are two kinds
 * of proxies used:
 *
 * - WebSocketProxy: Starts a local WebSocket server that proxies communication between the WebView
 *    client and the VNC server. This proxy is used when the WebView can connect to the localhost,
 *    possibly with port forwarding in the case of remote development.
 * - MessagePassingProxy: Starts a in-process server that implements a socket over the WebView's
 *    message passing mechanism. This proxy is used when the WebView can NOT connect to the
 *    localhost, e.g. when the editor is running within a web browser.
 *
 * The WebView is initially empty. Call start() to start WebView, possibly after subscribing to
 * some events.
 *
 * Call dispose() to destroy the session programmatically. It is also called when the user closes
 * the WebView panel.
 */
export class VncSession {
  // This CancellationToken is cancelled on disposal of this session.
  private readonly canceller = new vscode.CancellationTokenSource();

  private readonly panel: vscode.WebviewPanel;
  private readonly proxy: WebSocketProxy | MessagePassingProxy;

  private readonly onDidDisposeEmitter = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.onDidDisposeEmitter.event;

  private readonly onDidReceiveMessageEmitter =
    new vscode.EventEmitter<webviewShared.ClientMessage>();
  readonly onDidReceiveMessage = this.onDidReceiveMessageEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    // onDidDisposeEmitter is not listed here so we can fire it after disposing everything else.
    this.canceller,
    this.onDidReceiveMessageEmitter,
  ];

  static async create(
    hostname: string,
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel,
    sshIdentity: SshIdentity,
    rotate: boolean,
    proxyProtocol?: ProxyProtocol
  ): Promise<VncSession> {
    const forwardPort = await netUtil.findUnusedPort();
    return new VncSession(
      hostname,
      context,
      output,
      proxyProtocol,
      forwardPort,
      sshIdentity,
      rotate
    );
  }

  private constructor(
    hostname: string,
    private readonly context: vscode.ExtensionContext,
    output: vscode.OutputChannel,
    proxyProtocol: ProxyProtocol | undefined,
    forwardPort: number,
    sshIdentity: SshIdentity,
    rotate: boolean
  ) {
    this.panel = VncSession.createWebview(hostname);
    switch (proxyProtocol ?? detectProxyProtocol()) {
      case ProxyProtocol.WEBSOCKET:
        this.proxy = new WebSocketProxy(forwardPort);
        break;
      case ProxyProtocol.MESSAGE_PASSING:
        this.proxy = new MessagePassingProxy(forwardPort, this.panel.webview);
        break;
    }
    this.subscriptions.push(this.panel, this.proxy);

    this.subscriptions.push(
      this.panel.webview.onDidReceiveMessage(
        (message: webviewShared.ClientMessage) => {
          this.onDidReceiveMessageEmitter.fire(message);
        }
      )
    );

    void startAndWaitVncServer(
      hostname,
      forwardPort,
      this.panel.webview,
      output,
      this.canceller.token,
      sshIdentity,
      rotate
    );

    // Dispose the session when the panel is closed.
    this.subscriptions.push(
      this.panel.onDidDispose(() => {
        this.dispose();
      })
    );
  }

  async start(): Promise<void> {
    await VncSession.startWebview(this.panel.webview, this.proxy, this.context);
  }

  dispose(): void {
    this.canceller.cancel();
    vscode.Disposable.from(...this.subscriptions).dispose();
    this.onDidDisposeEmitter.fire();
    this.onDidDisposeEmitter.dispose();
  }

  revealPanel(): void {
    this.panel.reveal();
  }

  private static createWebview(hostname: string): vscode.WebviewPanel {
    return vscode.window.createWebviewPanel(
      'vncclient',
      `VNC: ${hostname}`,
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
    proxy: WebSocketProxy | MessagePassingProxy,
    context: vscode.ExtensionContext
  ): Promise<void> {
    let proxyUrl: string;
    if (proxy instanceof MessagePassingProxy) {
      proxyUrl = webviewShared.MESSAGE_PASSING_URL;
    } else {
      // Call asExternalUri with http:// URL to set up port forwarding
      // in the case of remote development.
      // https://code.visualstudio.com/api/advanced-topics/remote-extensions#option-1-use-asexternaluri
      const proxyHttpUrl = await vscode.env.asExternalUri(
        vscode.Uri.parse(`http://localhost:${proxy.listenPort}/`)
      );
      proxyUrl = proxyHttpUrl.with({scheme: 'ws'}).toString();
    }
    webview.html = VncSession.getWebviewContent(webview, proxyUrl, context);
  }

  private static getWebviewContent(
    webview: vscode.Webview,
    proxyUrl: string,
    context: vscode.ExtensionContext
  ): string {
    const filePath = path.join(context.extensionPath, 'dist/views/vnc.html');
    const html = fs.readFileSync(filePath, {encoding: 'utf-8'});
    // NOTE: No need to escape URLs for HTML attributes since vscode.Uri.toString() is aggressive
    // on escaping special characters.
    return replaceAll(html, [
      {
        from: /%EXTENSION_ROOT_URL%/g,
        to: webview.asWebviewUri(context.extensionUri).toString(),
      },
      {
        from: /%WEB_SOCKET_PROXY_URL%/g,
        to: proxyUrl,
      },
    ]);
  }
}

/**
 * Starts the VNC server on a remote device via SSH, and waits for its completion.
 * Once the VNC server gets ready, it notifies the WebView with message passing.
 */
async function startAndWaitVncServer(
  hostname: string,
  forwardPort: number,
  webview: vscode.Webview,
  output: vscode.OutputChannel,
  token: vscode.CancellationToken,
  sshIdentity: SshIdentity,
  rotate: boolean
): Promise<void> {
  const serverStopped = startVncServer(
    hostname,
    forwardPort,
    output,
    token,
    sshIdentity,
    rotate
  );
  const serverStarted = waitVncServer(forwardPort, token);
  const webViewReady = waitWebViewReady(webview);

  // Wait until the server starts, or fails to start.
  try {
    await Promise.race([serverStarted, serverStopped]);
  } catch (err: unknown) {
    const buttons = err instanceof DiagnosedError ? [...err.buttons] : [];
    buttons.push(createShowLogsButton(output));

    showErrorMessageWithButtons(`VNC server failed: ${err}`, buttons);
    return;
  }

  // Send a ready message once the WebView finishes to load scripts.
  void (async () => {
    try {
      await webViewReady;
      await postServerMessage(webview, {
        type: 'event',
        subtype: 'ready',
      });
    } catch (err: unknown) {
      void vscode.window.showErrorMessage(
        `Failed to start VNC webview: ${err}`
      );
    }
  })();

  // Wait until the server stops.
  try {
    await serverStopped;
  } catch (err: unknown) {
    const buttons = err instanceof DiagnosedError ? [...err.buttons] : [];
    buttons.push(createShowLogsButton(output));

    showErrorMessageWithButtons(`VNC server failed: ${err}`, buttons);
  }
}

/**
 * Starts the VNC server on a remote device via SSH.
 * The returned promise rejects if it fails to start the VNC server or the server exits
 * unexpectedly. It resolves only if it is cancelled via CancellationToken.
 *
 * It throws DiagnosedError if SSH command fails.
 */
async function startVncServer(
  hostname: string,
  forwardPort: number,
  output: vscode.OutputChannel,
  token: vscode.CancellationToken,
  sshIdentity: SshIdentity,
  rotate: boolean
): Promise<void> {
  const KMSVNC_PORT = 5900;
  let command = `fuser -k ${KMSVNC_PORT}/tcp; kmsvnc`;
  if (rotate) {
    command += ' --rotate';
  }
  const args = sshUtil.buildSshCommand(
    hostname,
    sshIdentity,
    ['-L', `${forwardPort}:localhost:${KMSVNC_PORT}`],
    command
  );

  const memoryOutput = new MemoryOutputChannel();

  const result = await commonUtil.exec(args[0], args.slice(1), {
    logger: new TeeOutputChannel(memoryOutput, output),
    logStdout: true,
    cancellationToken: token,
  });
  if (result instanceof commonUtil.CancelledError) {
    return;
  }
  if (result instanceof Error) {
    throw diagnoseSshError(result, memoryOutput.output);
  }
  throw new Error('VNC server stopped unexpectedly');
}

// Connects to the specified port on localhost to see if a VNC server is running there.
async function checkVncServer(vncPort: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(vncPort, 'localhost');
    socket.on('data', () => {
      socket.destroy();
      resolve();
    });
    socket.on('error', () => {
      // Ignore errors.
    });
    socket.on('close', () => {
      socket.destroy();
      reject();
    });
  });
}

// Waits until a VNC server starts on the specified port on localhost.
// The returned promise never rejects.
async function waitVncServer(
  vncPort: number,
  token: vscode.CancellationToken
): Promise<void> {
  const INTERVAL = 200; // minimum interval between attempts

  while (!token.isCancellationRequested) {
    const throttle = new Promise<void>(resolve => {
      setTimeout(resolve, INTERVAL);
    });
    try {
      return await checkVncServer(vncPort);
    } catch (err: unknown) {
      // Continue
    }
    await throttle;
  }
}

// Waits until WebView finishes loading scripts.
async function waitWebViewReady(webview: vscode.Webview): Promise<void> {
  return new Promise(resolve => {
    const subscription = webview.onDidReceiveMessage(
      (message: webviewShared.ClientMessage) => {
        const {type, subtype} = message;
        if (type === 'event' && subtype === 'ready') {
          subscription.dispose();
          resolve();
        }
      }
    );
  });
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

// Handles socket operations implemented over VSCode WebView's message passing mechanism.
// Specify a VNC server port on localhost to construct.
class MessagePassingProxy implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly sockets = new Map<number, net.Socket>();

  constructor(
    private readonly vncPort: number,
    private readonly webview: vscode.Webview
  ) {
    this.subscriptions.push(
      webview.onDidReceiveMessage((message: webviewShared.ClientMessage) =>
        this.onMessage(message)
      )
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
    for (const socket of this.sockets.values()) {
      socket.destroy();
    }
    this.sockets.clear();
  }

  private onMessage(message: webviewShared.ClientMessage): void {
    if (message.type !== 'socket') {
      return;
    }

    const {subtype, socketId} = message;
    switch (subtype) {
      case 'open': {
        const socket = net.createConnection(this.vncPort, 'localhost');
        this.sockets.set(socketId, socket);
        socket.on('connect', () => {
          void postServerMessage(this.webview, {
            type: 'socket',
            subtype: 'open',
            socketId,
          });
        });
        socket.on('error', (err: Error) => {
          void postServerMessage(this.webview, {
            type: 'socket',
            subtype: 'error',
            socketId,
            reason: err.message,
          });
        });
        socket.on('data', (data: Buffer) => {
          void postServerMessage(this.webview, {
            type: 'socket',
            subtype: 'data',
            socketId,
            data: data.toString('base64'),
          });
        });
        socket.on('close', () => {
          void postServerMessage(this.webview, {
            type: 'socket',
            subtype: 'close',
            socketId,
          });
        });
        break;
      }

      case 'close': {
        const socket = this.sockets.get(socketId);
        if (!socket) {
          break;
        }
        socket.destroy();
        this.sockets.delete(socketId);
        break;
      }

      case 'data': {
        const socket = this.sockets.get(socketId);
        if (!socket) {
          break;
        }
        socket.write(Buffer.from(message.data, 'base64'));
        break;
      }
    }
  }
}

/**
 * Escapes a string for embedding in HTML attribute values.
 */
// Type-safe wrapper of vscode.Webview.postMessage.
async function postServerMessage(
  webview: vscode.Webview,
  message: webviewShared.ServerMessage
): Promise<void> {
  await webview.postMessage(message);
}

function detectProxyProtocol(): ProxyProtocol {
  // Prefer WebSocket protocol as it's more efficient.
  if (vscode.env.appHost === 'desktop') {
    return ProxyProtocol.WEBSOCKET;
  }
  // In other cases, fall back to the message passing protocol.
  return ProxyProtocol.MESSAGE_PASSING;
}
