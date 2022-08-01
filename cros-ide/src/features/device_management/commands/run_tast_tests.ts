// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as shutil from '../../../common/shutil';
import * as ssh from '../ssh_session';
import * as netUtil from '../../../common/net_util';
import * as metrics from '../../metrics/metrics';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

export async function runTastTests(context: CommandContext): Promise<void> {
  metrics.send({
    category: 'interactive',
    group: 'device',
    action: 'run Tast tests',
  });

  // Get the test to run from file path and function name.
  const document = vscode.window.activeTextEditor?.document;
  if (document === undefined) {
    return;
  }
  const category = path.basename(path.dirname(document.uri.fsPath));
  const contents = await fs.promises.readFile(document.uri.fsPath, {
    encoding: 'utf-8',
  });
  const testFuncRE = /^\s*Func:\s*(\w+),/m;
  // Check if it is possible to run a test from the file.
  const testFuncName = contents.match(testFuncRE);
  if (testFuncName === null) {
    const choice = await vscode.window.showErrorMessage(
      'Could not find test to run from file. Was the test registered?',
      'Test registration'
    );
    if (choice) {
      void vscode.env.openExternal(
        vscode.Uri.parse(
          'https://chromium.googlesource.com/chromiumos/platform/tast/+/HEAD/docs/writing_tests.md#Test-registration'
        )
      );
    }
    return;
  }

  const hostname = await promptKnownHostnameIfNeeded(
    'Connect to Device',
    undefined,
    context.deviceRepository
  );
  if (!hostname) {
    return;
  }

  // Use existing session if there is one.
  const existingSession = context.sshSessions.get(hostname);
  const defaultForwardPort =
    existingSession === undefined
      ? await netUtil.findUnusedPort()
      : existingSession.forwardPort;
  if (!existingSession) {
    // Create new ssh session.
    const newSession = await ssh.SshSession.create(
      hostname,
      context.extensionContext,
      context.output,
      defaultForwardPort
    );
    newSession.onDidDispose(() => context.sshSessions.delete(hostname));
    context.sshSessions.set(hostname, newSession);
  }

  // Get list of available tests.
  const target = `localhost:${defaultForwardPort}`;
  const res = await context.chrootService.exec('tast', ['list', target], {
    sudoReason: 'to get list of available tests.',
  });
  if (res instanceof Error) {
    context.output.appendLine(res.message);
    return;
  }
  const testName = `${category}.${testFuncName[1]}`;
  // Tast tests can specify parameterized tests. Check for these as options.
  const testNameRE = new RegExp(`^${testName}(?:\\.\\w+)*$`, 'gm');
  const matches = [...res.stdout.matchAll(testNameRE)];
  const testOptions = matches.map(match => match[0]);
  if (testOptions.length === 0) {
    void vscode.window.showInformationMessage(
      `This is not a test avaialble for ${hostname}`
    );
    return;
  }
  const choice = await vscode.window.showQuickPick(testOptions, {
    title: 'Test Options',
    canPickMany: true,
  });
  if (!choice) {
    return;
  }
  const args = ['run', target, ...choice];

  // If terminal for specified host exists, use that.
  const terminal = terminalForHost(hostname);
  const hostTerminal =
    terminal === undefined ? vscode.window.createTerminal(hostname) : terminal;
  const terminalCommand = shutil.escapeArray(['cros_sdk', 'tast', ...args]);
  hostTerminal.sendText(terminalCommand);
  hostTerminal.show();
}

function terminalForHost(hostname: string): vscode.Terminal | undefined {
  for (const terminal of vscode.window.terminals) {
    if (terminal.name === hostname) {
      return terminal;
    }
  }
  return undefined;
}
