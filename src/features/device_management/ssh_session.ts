// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as net from 'net';
import * as vscode from 'vscode';
import * as commonUtil from '../../../shared/app/common/common_util';
import {CancelledError} from '../../../shared/app/common/exec/types';
import {assertNever} from '../../../shared/app/common/typecheck';
import {MemoryOutputChannel} from '../../common/memory_output_channel';
import {TeeOutputChannel} from '../../common/tee_output_channel';
import {
  DiagnosedError,
  diagnoseSshError,
  showErrorMessageWithButtons,
} from './diagnostic';
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
  const err = await Promise.race([startTunnelAndWait, checkTunnelIsUp]);
  if (!err) {
    return true;
  }
  if (!(err instanceof Error)) assertNever(err);

  if (err instanceof DiagnosedError) {
    showErrorMessageWithButtons(
      `SSH server failed: ${err.message}`,
      err.buttons
    );
  } else {
    void vscode.window.showErrorMessage(`SSH server failed: ${err}`);
  }

  output.appendLine(`SSH server failed: ${err}\n${err.stack}`);
  return false;
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
): Promise<undefined | Error | DiagnosedError> {
  const SSH_PORT = 22;
  const args = sshUtil.buildSshCommand(hostname, sshIdentity, [
    '-L',
    `${forwardPort}:localhost:${SSH_PORT}`,
  ]);

  const memoryOutput = new MemoryOutputChannel();
  const result = await commonUtil.exec(args[0], args.slice(1), {
    logger: new TeeOutputChannel(memoryOutput, output),
    logStdout: true,
    cancellationToken: token,
  });
  if (result instanceof CancelledError) {
    return;
  }
  if (result instanceof Error) {
    return diagnoseSshError(result, memoryOutput.output);
  }
  return new Error('SSH server stopped unexpectedly');
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
    if (await checkSshConnection(sshPort)) {
      return;
    }
    await throttle;
  }
}

/**
 * Connects to the specified port on localhost to see if a SSH connection is open.
 *
 * @returns true on success, false otherwise.
 */
async function checkSshConnection(sshPort: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection(sshPort, 'localhost');
    socket.on('data', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      // Ignore errors.
    });
    socket.on('close', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
