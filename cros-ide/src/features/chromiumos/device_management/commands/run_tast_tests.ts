// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// TODO(oka): Move this file and registration of the command to the
// features/chromiumos/tast component.

import * as vscode from 'vscode';
import * as shutil from '../../../../common/shutil';
import * as ssh from '../ssh_session';
import * as netUtil from '../../../../common/net_util';
import * as services from '../../../../services';
import * as metrics from '../../../metrics/metrics';
import * as parser from '../../tast/parser';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

export async function runTastTests(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService
): Promise<void> {
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
  const testCase = parser.parseTestCase(document);
  if (!testCase) {
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

  // Check if we can reuse existing session
  let okToReuseSession = false;
  const existingSession = context.sshSessions.get(hostname);

  if (existingSession) {
    // If tunnel is not up, then do not reuse the session
    const isPortUsed = await netUtil.isPortUsed(existingSession.forwardPort);

    if (isPortUsed) {
      okToReuseSession = true;
    } else {
      existingSession.dispose();
    }
  }

  let port: number;
  if (existingSession && okToReuseSession) {
    port = existingSession.forwardPort;
  } else {
    // Create new ssh session.
    port = await netUtil.findUnusedPort();

    const newSession = await ssh.SshSession.create(
      hostname,
      context.extensionContext,
      context.output,
      port
    );
    newSession.onDidDispose(() => context.sshSessions.delete(hostname));
    context.sshSessions.set(hostname, newSession);
  }

  // Get list of available tests.
  const target = `localhost:${port}`;
  let testList = undefined;
  try {
    testList = await getAvailableTests(
      context,
      chrootService,
      target,
      testCase.name
    );
  } catch (err: unknown) {
    const choice = await vscode.window.showErrorMessage(
      'Error finding available tests.',
      'Open Logs'
    );
    if (choice) {
      context.output.show();
    }
    return;
  }
  if (testList === undefined) {
    void vscode.window.showWarningMessage('Cancelled getting available tests.');
    return;
  }
  if (testList.length === 0) {
    void vscode.window.showInformationMessage(
      `This is not a test available for ${hostname}`
    );
    return;
  }
  // Show available test options.
  const choice = await vscode.window.showQuickPick(testList, {
    title: 'Test Options',
    canPickMany: true,
  });
  if (!choice) {
    return;
  }
  const args = ['run', target, ...choice];

  // If terminal for specified host exists, use that.
  const tastTerminalName = getTerminalNameForTastExecution(hostname);
  const terminal = terminalForHost(tastTerminalName);
  const hostTerminal =
    terminal === undefined
      ? vscode.window.createTerminal(tastTerminalName)
      : terminal;
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

function getTerminalNameForTastExecution(hostname: string): string {
  return '[tast-test]'.concat(hostname);
}

/**
 * Gets available tests for a given test name.
 *
 * @param context The current command context.
 * @param target The target to run the `tast list` command on.
 * @param testName The name of the test to search for in the `tast list` results.
 * @returns It returns the list of possible tests to run. Only returns undefined
 * if the operation is cancelled.
 */
async function getAvailableTests(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService,
  target: string,
  testName: string
): Promise<string[] | undefined> {
  // Show a progress notification as this is a long operation.
  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: true,
      title: 'Getting available tests for host... (may take 1+ minutes)',
    },
    async (_progress, token) => {
      const res = await chrootService.exec('tast', ['list', target], {
        sudoReason: 'to get list of available tests.',
        logger: context.output,
        cancellationToken: token,
      });
      if (token.isCancellationRequested) {
        return undefined;
      }
      if (res instanceof Error) {
        context.output.append(res.message);
        throw res;
      }
      // Tast tests can specify parameterized tests. Check for these as options.
      const testNameRE = new RegExp(`^${testName}(?:\\.\\w+)*$`, 'gm');
      const matches = [...res.stdout.matchAll(testNameRE)];
      return matches.map(match => match[0]);
    }
  );
}
