// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import type {SshIdentity} from './ssh_identity';

/**
 * Returns the path to the testing_rsa file bundled in the extension.
 *
 * The activation function of the device management feature ensures that the file
 * has a safe permission (0600).
 */
export function getTestingRsaPath(extensionUri: vscode.Uri): string {
  return vscode.Uri.joinPath(extensionUri, 'resources', 'testing_rsa').fsPath;
}

/**
 * Constructs a command line to run SSH for a host.
 *
 * @param host hostname, which can be in the format of 'hostname' or 'hostname:port'
 * @param extraOptions additional SSH options for your command
 * @param cmd remote command to execute
 * @returns a command line
 */
export function buildSshCommand(
  host: string,
  sshIdentity: SshIdentity,
  extraOptions: string[] = [],
  cmd?: string
): string[] {
  const [hostname, portname] = host.split(':');

  const args = ['ssh', ...sshIdentity.filePaths.flatMap(x => ['-i', x])];
  args.push(
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null'
  );
  if (portname) {
    args.push('-p', portname);
  }
  if (extraOptions) {
    args.push(...extraOptions);
  }
  args.push(`root@${hostname}`);
  if (cmd) {
    args.push(cmd);
  }
  return args;
}
