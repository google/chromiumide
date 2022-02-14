// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Keep all general utility functions here, or in common_util.
 */
import * as vscode from 'vscode';
import * as childProcess from 'child_process';

export function runSSH(host: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    childProcess.execFile('ssh', [host].concat(args), (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

export function getConfigRoot(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('cros');
}

export function createTerminalForHost(
    host: string, namePrefix: string, extensionUri: vscode.Uri,
    extraOptions: string): vscode.Terminal {
  const testingRsa =
      vscode.Uri.joinPath(extensionUri, 'resources', 'testing_rsa');
  const terminal = vscode.window.createTerminal(`${namePrefix} ${host}`);
  const splitHost = host.split(':');
  let portOption = '';
  if (splitHost.length === 2) {
    host = splitHost[0];
    portOption = `-p ${splitHost[1]}`;
  }
  terminal.sendText(
      `ssh -i ${testingRsa.fsPath} ${extraOptions} ${portOption} ` +
      `root@${host}; exit $?`);
  return terminal;
}
