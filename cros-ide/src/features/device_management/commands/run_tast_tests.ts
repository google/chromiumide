// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// TODO(oka): Move this file and registration of the command to the
// features/chromiumos/tast component.

import * as vscode from 'vscode';
import * as ssh from '../ssh_session';
import * as netUtil from '../../../common/net_util';
import * as services from '../../../services';
import * as metrics from '../../metrics/metrics';
import * as parser from '../../chromiumos/tast/parser';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

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
 * Represents the result of the call to runTastTests.
 */
export class RunTastTestsResult {
  constructor() {}
}

/**
 * Prompts a user for tast tests to run, and returns the results of
 * running the selected tests. Returns null when the tests aren't run.
 * @param context The current command context.
 * @param chrootService The chroot to run commands in.
 */
export async function runTastTests(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService
): Promise<RunTastTestsResult | null | Error> {
  metrics.send({
    category: 'interactive',
    group: 'device',
    action: 'run Tast tests',
  });

  // Get the test to run from file path and function name.
  const document = vscode.window.activeTextEditor?.document;
  if (document === undefined) {
    return null;
  }
  const testCase = parser.parseTestCase(document);
  if (!testCase) {
    // Show the errors without waiting so the main UI can continue.
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
    return null;
  }

  const hostname = await promptKnownHostnameIfNeeded(
    'Connect to Device',
    undefined,
    context.deviceRepository
  );
  if (!hostname) {
    return null;
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

  try {
    await runSelectedTests(context, chrootService, target, choice);
    showPromptWithOpenLogChoice(context, 'Tests run successfully.', false);
    return new RunTastTestsResult();
  } catch (err) {
    showPromptWithOpenLogChoice(context, 'Failed to run tests.', true);
    throw err;
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
async function getAvailableTests(
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
 * Runs all of the selected tests.
 * @param context The current command context.
 * @param chrootService The chroot to run commands in.
 * @param target The target to run the `tast list` command on.
 * @param testNames The names of the tests to run.
 */
async function runSelectedTests(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService,
  target: string,
  testNames: string[]
): Promise<void | Error> {
  // Show a progress notification as this is a long operation.
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: true,
      title: 'Running tests',
    },
    async (_progress, token) => {
      // Run all of the provided tests. `failfortests` is used to have
      // the Tast command return an error status code on any test failure.
      const res = await chrootService.exec(
        'tast',
        ['run', '-failfortests', target, ...testNames],
        {
          sudoReason: 'to run tast tests',
          logger: context.output,
          cancellationToken: token,
          ignoreNonZeroExit: true,
        }
      );
      if (token.isCancellationRequested) {
        return;
      }
      // Handle response errors.
      if (res instanceof Error) {
        context.output.append(res.message);
        throw res;
      }
      // Handle custom errors that are returned from Tast. It may make sense
      // to parse stdout in order to return fail/pass/etc. for each test in the
      // future.
      const {exitStatus, stdout} = res;

      // Always append the output since it contains the results that a user
      // can use for diagnosing issues/success.
      context.output.append(stdout);

      if (exitStatus !== 0) {
        throw new Error('Failed to run tests');
      }
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
function showPromptWithOpenLogChoice(
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
