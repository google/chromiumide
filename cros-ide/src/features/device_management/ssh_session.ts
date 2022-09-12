// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as net from 'net';
import * as commonUtil from '../../common/common_util';
import * as sshUtil from './ssh_util';

/**
 * Represents an active SSH session of a device. It can be used to manage SSH sessions
 * for different hosts.
 */
export class SshSession {
  // This CancellationToken is cancelled on disposal of this session.
  private readonly canceller = new vscode.CancellationTokenSource();

  private readonly onDidDisposeEmitter = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.onDidDisposeEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    // onDidDisposeEmitter is not listed here so we can fire it after disposing everything else.
    this.canceller,
  ];

  static async create(
    hostname: string,
    context: vscode.ExtensionContext,
    output: vscode.OutputChannel,
    forwardPort: number
  ): Promise<SshSession> {
    const newSession = new SshSession(forwardPort);
    // TODO(b/242749139): Resolve race condition. Since we do not wait for the connection to be
    // established, there is a race condition where one could attempt to connect to the host before
    // local forwarding is set up.
    void startAndWaitSshConnection(
      hostname,
      forwardPort,
      output,
      newSession.canceller.token,
      context
    );
    return newSession;
  }

  /**
   * @param forwardPort The local port that forwards traffic through SSH tunnel.
   */
  private constructor(readonly forwardPort: number) {}

  dispose(): void {
    this.canceller.cancel();
    vscode.Disposable.from(...this.subscriptions).dispose();
    this.onDidDisposeEmitter.fire();
    this.onDidDisposeEmitter.dispose();
  }
}

/**
 * Establish the SSH connection and wait for the connection to end.
 */
async function startAndWaitSshConnection(
  hostname: string,
  forwardPort: number,
  output: vscode.OutputChannel,
  token: vscode.CancellationToken,
  context: vscode.ExtensionContext
): Promise<void> {
  const serverStopped = connectAndWaitSshCommand(
    hostname,
    forwardPort,
    output,
    token,
    context
  );
  const serverStarted = waitSshServer(forwardPort, token);

  // Wait until connection with server starts, or fails to start.
  try {
    await Promise.race([serverStarted, serverStopped]);
  } catch (err: unknown) {
    void vscode.window.showErrorMessage(`SSH server failed: ${err}`);
    return;
  }

  // Wait until the connection to the server stops.
  try {
    await serverStopped;
  } catch (err: unknown) {
    void vscode.window.showErrorMessage(`SSH server failed: ${err}`);
  }
}

// Connects to SSH server and waits for command to exit.
async function connectAndWaitSshCommand(
  hostname: string,
  forwardPort: number,
  output: vscode.OutputChannel,
  token: vscode.CancellationToken,
  context: vscode.ExtensionContext
): Promise<void> {
  const SSH_PORT = 22;
  const args = sshUtil.buildSshCommand(hostname, context.extensionUri, [
    '-L',
    `${forwardPort}:localhost:${SSH_PORT}`,
  ]);
  const result = await commonUtil.exec(args[0], args.slice(1), {
    logger: output,
    logStdout: true,
    cancellationToken: token,
  });
  if (result instanceof commonUtil.CancelledError) {
    return;
  }
  if (result instanceof Error) {
    throw result;
  }
  throw new Error('SSH server stopped unexpectedly');
}

async function waitSshServer(
  sshPort: number,
  token: vscode.CancellationToken
): Promise<void> {
  const INTERVAL = 200; // minimum interval between attempts

  while (!token.isCancellationRequested) {
    const throttle = new Promise<void>(resolve => {
      setTimeout(resolve, INTERVAL);
    });
    try {
      return await checkSshConnection(sshPort);
    } catch (err: unknown) {
      // Continue
    }
    await throttle;
  }
}

// Connects to the specified port on localhost to see if a SSH connection is open.
async function checkSshConnection(sshPort: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(sshPort, 'localhost');
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
