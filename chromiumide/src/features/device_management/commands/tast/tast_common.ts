// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as services from '../../../../services';
import {ChrootService} from '../../../../services/chromiumos';
import * as parser from '../../../chromiumos/tast/parser';
import {
  CommandContext,
  ensureSshSession,
  promptKnownHostnameIfNeeded,
} from '../common';

/**
 * Lays the foundation for running Tast tests. It involes parsing the active document for test
 * cases, asking the user the device to run the tests on, and ensuring an SSH session to the device.
 *
 * It returns null in case of failure showing the user an error message as needed.
 */
export async function preTestSetUp(context: CommandContext): Promise<null | {
  hostname: string;
  testCase: parser.ParsedTestCase;
  port: number;
}> {
  const testCase = findTestCase();
  if (!testCase) return null;

  const hostname = await promptKnownHostnameIfNeeded(
    'Connect to Device',
    undefined,
    context.deviceRepository
  );
  if (!hostname) return null;

  const port = await ensureSshSession(context, hostname);
  if (!port) return null;

  return {hostname, testCase, port};
}

/** Gets the test to run from the active document. */
function findTestCase(): parser.ParsedTestCase | undefined {
  const document = vscode.window.activeTextEditor?.document;
  if (!document) {
    return undefined;
  }

  const testCase = parser.parseTestCase(document);
  if (testCase) {
    return testCase;
  }

  void (async () => {
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
  })();

  return undefined;
}

export async function askTestNames(
  context: CommandContext,
  chrootService: ChrootService,
  hostname: string,
  target: string,
  testCase: parser.ParsedTestCase
): Promise<null | string[]> {
  let testList = undefined;
  try {
    testList = await getAvailableTestsOrThrow(
      context,
      chrootService,
      target,
      testCase.name
    );
  } catch (err: unknown) {
    showPromptWithOpenLogChoice(
      context,
      err instanceof TastListBuildError
        ? err.message
        : 'Error finding available tests.',
      true
    );
    return null;
  }
  if (testList === undefined) {
    void vscode.window.showWarningMessage('Cancelled getting available tests.');
    return null;
  }
  if (testList.length === 0) {
    void vscode.window.showInformationMessage(
      `This is not a test available for ${hostname}`
    );
    return null;
  }
  // Show available test options.
  const choice = await vscode.window.showQuickPick(testList, {
    title: 'Test Options',
    canPickMany: true,
  });
  if (!choice || choice.length <= 0) {
    return null;
  }

  return choice;
}

/**
 * Represents a Tast build error that can occur after calling the list command.
 * The message can be reported directly to the user.
 */
class TastListBuildError extends Error {
  constructor() {
    super(
      'Tast failed to build, please ensure all issues are addressed before trying again.'
    );
  }
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
async function getAvailableTestsOrThrow(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService,
  target: string,
  testName: string
): Promise<string[] | undefined> {
  // Show a progress notification as this is a long operation.
  return vscode.window.withProgress(
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
        ignoreNonZeroExit: true,
      });
      if (token.isCancellationRequested) {
        return undefined;
      }
      // Handle response errors.
      if (res instanceof Error) {
        context.output.append(res.message);
        throw res;
      }
      // Handle errors based on the status code.
      const {exitStatus, stderr} = res;
      if (exitStatus !== 0) {
        // Parse out custom build failure messages if they exist.
        if (stderr.includes('build failed:')) {
          throw new TastListBuildError();
        }
        throw new Error('Failed to list available tests');
      }
      // Tast tests can specify parameterized tests. Check for these as options.
      const testNameRE = new RegExp(`^${testName}(?:\\.\\w+)*$`, 'gm');
      const matches = [...res.stdout.matchAll(testNameRE)];
      return matches.map(match => match[0]);
    }
  );
}

/**
 * Shows an error, or informational prompt with the option to open logs.
 * This function does not wait for a response.
 * @param context The context output to show when clicking 'Open Logs'.
 * @param message The message to display to the user.
 * @param isError Whether or not an error, or informational prompt should show.
 */
export function showPromptWithOpenLogChoice(
  context: CommandContext,
  message: string,
  isError: boolean
): void {
  void (async () => {
    const promptFn = isError
      ? vscode.window.showErrorMessage
      : vscode.window.showInformationMessage;
    const choice = await promptFn(message, 'Open Logs');
    if (choice) {
      context.output.show();
    }
  })();
}
