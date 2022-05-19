// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as shutil from '../../common/shutil';
import * as metrics from '../../features/metrics/metrics';

/**
 * Returns the path to the testing_rsa file bundled in the extension.
 *
 * The activation function of the DUT management feature ensures that the file
 * has a safe permission (0600).
 */
export function getTestingRsaPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, 'resources', 'testing_rsa')
    .fsPath;
}

/**
 * Creates a new terminal that connects to the specified host.
 *
 * @param host Name of the host to connect to.
 * @param namePrefix Prefix added to the terminal window name.
 * @param context vscode.ExtensionContext of the extension.
 * @param extraOptions Extra options passed to the SSH command.
 * @returns vscode.Terminal for the created terminal.
 */
export function createTerminalForHost(
  host: string,
  namePrefix: string,
  context: vscode.ExtensionContext,
  extraOptions?: string[]
): vscode.Terminal {
  const terminal = vscode.window.createTerminal(`${namePrefix} ${host}`);

  const command = buildSshCommand(
    host,
    getTestingRsaPath(context),
    undefined,
    extraOptions
  );
  terminal.sendText(`${command}; exit $?`);
  metrics.send({category: 'ideUtil', action: 'create terminal for host'});
  return terminal;
}

/**
 * Constructs a command line to run SSH for a host.
 *
 * @param host hostname, which can be in the format of 'hostname' or 'hostname:port'
 * @param testingRsaPath absolute path to the testing_rsa key
 * @param cmd remote command to execute
 * @param extraOptions additional SSH options for your command
 * @returns a command line
 */
function buildSshCommand(
  host: string,
  testingRsaPath: string,
  cmd?: string,
  extraOptions?: string[]
): string {
  let port = '22';
  const [hostname, portname] = host.split(':');
  if (portname !== undefined) {
    host = hostname;
    port = portname;
  }

  const args = ['ssh', '-i', testingRsaPath];
  args.push(
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-p',
    port
  );
  if (extraOptions) {
    args.push(...extraOptions);
  }
  args.push(`root@${host}`);
  if (cmd) {
    args.push(cmd);
  }
  return shutil.escapeArray(args);
}
