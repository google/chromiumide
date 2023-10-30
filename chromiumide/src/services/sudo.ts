// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';

const onDidRunSudoWithPasswordEmitter = new vscode.EventEmitter<void>();

/**
 * Fired on running sudo successfully with one or more password prompts.
 * It is not fired if sudo failed, or sudo succeeded without password.
 */
export const onDidRunSudoWithPassword = onDidRunSudoWithPasswordEmitter.event;

export interface SudoExecOptions extends commonUtil.ExecOptions {
  /**
   * String that tells the user why sudo is required. It must start with "to ".
   * Example: 'to generate C++ cross references'
   */
  sudoReason: `to ${string}`;
}

/**
 * Runs command as the root user with sudo.
 *
 * It asks the password on VSCode input box if needed, hence a service.
 */
export async function execSudo(
  name: string,
  args: string[],
  options: SudoExecOptions
): ReturnType<typeof commonUtil.exec> {
  const askpass = await AskpassServer.start(options);
  try {
    const result = await commonUtil.exec(
      'sudo',
      ['--askpass', '--', name, ...args],
      {
        ...options,
        env: {
          ...(options.env ?? {}),
          SUDO_ASKPASS: askpass.scriptPath,
        },
      }
    );
    if (!(result instanceof Error) && askpass.attempts > 0) {
      onDidRunSudoWithPasswordEmitter.fire();
    }
    return result;
  } finally {
    await askpass.stop();
  }
}

/**
 * Server for sudo askpass.
 *
 * A server listens on a UNIX domain socket created on a temporary directory,
 * and saves a Python script that behaves as an askpass command. When the
 * script is run by sudo, it connects to the UNIX domain socket, which makes
 * VSCode show a password prompt and send an entered password to the socket.
 */
class AskpassServer {
  attempts = 0;

  private constructor(
    private readonly options: SudoExecOptions,
    private readonly server: net.Server,
    private readonly tempDir: string
  ) {
    server.on('connection', socket => this.handleConnection(socket));
    server.on('error', () => {}); // ignore errors
  }

  static async start(options: SudoExecOptions): Promise<AskpassServer> {
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'cros-ide-askpass.')
    );
    const socketPath = path.join(tempDir, 'socket');
    const scriptPath = path.join(tempDir, 'askpass');

    // Write an askpass script.
    const script = `#!/usr/bin/env python3
import os, socket, sys
sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.connect(os.path.join(os.path.dirname(__file__), 'socket'))
sys.stdout.write(sock.makefile().read())
`;
    await fs.promises.mkdir(tempDir, {recursive: true});
    await fs.promises.writeFile(scriptPath, script, {
      encoding: 'utf-8',
      mode: '0700',
    });

    // Start a server.
    const server = net.createServer();
    await new Promise<void>(resolve => {
      server.listen(socketPath, resolve);
    });

    return new AskpassServer(options, server, tempDir);
  }

  async stop(): Promise<void> {
    this.server.close();
    await fs.promises.rm(this.tempDir, {recursive: true});
  }

  get scriptPath(): string {
    return path.join(this.tempDir, 'askpass');
  }

  private handleConnection(socket: net.Socket): void {
    this.attempts++;

    void (async () => {
      const password = await vscode.window.showInputBox({
        password: true,
        title: `sudo password for ${os.userInfo().username}`,
        prompt: `ChromiumIDE needs your password ${this.options.sudoReason}`,
        ignoreFocusOut: true,
      });

      if (password) {
        await new Promise<void>(resolve => {
          socket.write(password, () => {
            resolve();
          });
        });
      }
      await new Promise<void>(resolve => {
        socket.end(() => {
          resolve();
        });
      });
    })();
  }
}
