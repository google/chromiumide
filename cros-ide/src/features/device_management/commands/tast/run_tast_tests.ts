// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// TODO(oka): Move this file and registration of the command to the
// features/chromiumos/tast component.

import * as vscode from 'vscode';
import * as services from '../../../../services';
import * as config from '../../../../services/config';
import {Metrics} from '../../../metrics/metrics';
import {CommandContext} from '../common';
import {
  askTestNames,
  preTestSetUp,
  showPromptWithOpenLogChoice,
} from './tast_common';

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
  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_run_tast_tests',
    description: 'run Tast tests',
  });

  const preTestResult = await preTestSetUp(context);
  if (!preTestResult) {
    return null;
  }
  const {hostname, testCase, port} = preTestResult;

  // Get list of available tests.
  const target = `localhost:${port}`;

  const testNames = await askTestNames(
    context,
    chrootService,
    hostname,
    target,
    testCase
  );
  if (!testNames) {
    return null;
  }

  try {
    await runSelectedTests(context, chrootService, target, testNames);
    showPromptWithOpenLogChoice(context, 'Tests run successfully.', false);
    return new RunTastTestsResult();
  } catch (err) {
    showPromptWithOpenLogChoice(context, 'Failed to run tests.', true);
    throw err;
  }
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
  const extraArgs = config.tast.extraArgs.get();

  context.output.show();

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
        ['run', '-failfortests', ...extraArgs, target, ...testNames],
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
