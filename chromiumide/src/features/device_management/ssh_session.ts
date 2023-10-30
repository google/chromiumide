// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as net from 'net';
import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import {SshIdentity} from './ssh_identity';
import * as sshUtil from './ssh_util';

/**
 * Represents an active SSH session of a device. It can be used to manage SSH sessions
 * for different hosts.
 */
export class SshSession implements vscode.Disposable {
  // This CancellationToken is cancelled on disposal of this session.
  private readonly canceller = new vscode.CancellationTokenSource();

  private readonly onDidDisposeEmitter = new vscode.EventEmitter<void>();
  readonly onDidDispose = this.onDidDisposeEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    // onDidDisposeEmitter is not listed here so we can fire it after disposing everything else.
    this.canceller,
  ];

  /**
   * Creates a new SSH session. On failure starting SSH connection, it reports the error and
   * returns undefined.
   */
  static async create(
    hostname: string,
    sshIdentity: SshIdentity,
    output: vscode.OutputChannel,
    forwardPort: number
  ): Promise<SshSession | undefined> {
    const newSession = new SshSession(forwardPort);

    const success = await startSshConnection(
      hostname,
      forwardPort,
      output,
      newSession.canceller.token,
      sshIdentity
    );

    if (!success) {
      newSession.dispose();
      return undefined;
    }
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
 * Starts SSH connection. It does error handling on its own and returns whether the operation was
 * successful or not.
 */
async function startSshConnection(
  hostname: string,
  forwardPort: number,
  output: vscode.OutputChannel,
  token: vscode.CancellationToken,
  sshIdentity: SshIdentity
): Promise<boolean> {
  const startTunnelAndWait = createTunnelAndWait(
    hostname,
    forwardPort,
    output,
    token,
    sshIdentity
  );
  const checkTunnelIsUp = waitSshServer(forwardPort, token);

  // Wait until connection with server starts, or fails to start.
  try {
    await Promise.race([startTunnelAndWait, checkTunnelIsUp]);
  } catch (e) {
    const err = e as Error;
    void vscode.window.showErrorMessage(`SSH server failed: ${err}`);
    output.appendLine(`SSH server failed: ${err}\n${err.stack}`);
    return false;
  }
  return true;
}

/**
 * This call will block indefinitely until tunnel is exited or an error occurs
 */
async function createTunnelAndWait(
  hostname: string,
  forwardPort: number,
  output: vscode.OutputChannel,
  token: vscode.CancellationToken,
  sshIdentity: SshIdentity
) {
  const SSH_PORT = 22;
  const args = sshUtil.buildSshCommand(hostname, sshIdentity, [
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
    throw new Error(
      'Problem creating SSH tunnel. Maybe try gcert first?. Full error:'.concat(
        result.message
      )
    );
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
