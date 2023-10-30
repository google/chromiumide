// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// TODO(oka): Move this file and registration of the command to the
// features/chromiumos/tast component.

import * as vscode from 'vscode';
import {ChrootService} from '../../../../services/chromiumos';
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
export type RunTastTestsResult =
  | {
      status: 'run';
      /**
       * Test results or an Error if reading or parsing the result.json failed.
       */
      results: ExtTestResult[] | Error;
    }
  | {
      status: 'cancel';
    }
  | {
      status: 'error';
      error: Error;
    };

/**
 * Represents the result of a test. This type is an extension of the TestResult with the custom
 * result field.
 */
export type ExtTestResult = TestResult & {
  result: 'passed' | 'failed' | 'skipped';
};

/**
 * Subset of the TestResult type defined in
 * https://pkg.go.dev/go.chromium.org/chromiumos/infra/proto/go/tast#TestResult
 */
export type TestResult = {
  name: string;
  errors: TestError[] | null;
  skipReason: string;
};

/**
 * Subset of the TestError type defined in
 * https://pkg.go.dev/go.chromium.org/chromiumos/infra/proto/go/tast#TestError.
 */
export type TestError = {
  reason: string;
};

/**
 * Prompts a user for tast tests to run, and returns the results of
 * running the selected tests. Returns null when the tests aren't run.
 * @param context The current command context.
 * @param chrootService The chroot to run commands in.
 */
export async function runTastTests(
  context: CommandContext,
  chrootService: ChrootService
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

  const extraArgs = config.tast.extraArgs.get();
  context.output.show();

  // Show a progress notification as this is a long operation.
  const res = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: true,
      title: 'Running tests',
    },
    async (_progress, token) => {
      return await runSelectedTests(
        context,
        chrootService,
        target,
        testNames,
        extraArgs,
        token
      );
    }
  );

  notifyTestResults(context, res);

  return res;
}

function notifyTestResults(
  context: CommandContext,
  res: RunTastTestsResult
): void {
  switch (res.status) {
    case 'cancel': {
      showPromptWithOpenLogChoice(
        context,
        'Cancelled running tests.',
        /* isError = */ true
      );
      return;
    }
    case 'error': {
      context.output.append(res.error.message);
      showPromptWithOpenLogChoice(
        context,
        `Command failed: ${res.error.message}`,
        true
      );
      return;
    }
    case 'run': {
      if (res.results instanceof Error) {
        context.output.append(res.results.message);
        showPromptWithOpenLogChoice(
          context,
          `Tests finished but reading results failed: ${res.results.message}`,
          true
        );
        return;
      }

      const skipped = res.results.filter(x => x.result === 'skipped').length;
      const run = res.results.length - skipped;
      const failed = res.results.filter(x => x.result === 'failed').length;

      let message =
        failed > 0
          ? `${failed} / ${run} test(s) failed`
          : `All ${run} test(s) passed`;
      if (skipped > 0) {
        message += ` (${skipped} skipped)`;
      }
      showPromptWithOpenLogChoice(context, message, failed > 0);

      return;
    }
    default: {
      ((_: never) => {})(res); // typecheck
    }
  }
}

/**
 * Runs all of the selected tests.
 *
 * @param context The current command context.
 * @param chrootService The chroot to run commands in.
 * @param target The target to run the `tast list` command on.
 * @param testNames The names of the tests to run.
 */
async function runSelectedTests(
  context: CommandContext,
  chrootService: ChrootService,
  target: string,
  testNames: string[],
  extraArgs: string[],
  token: vscode.CancellationToken
): Promise<RunTastTestsResult> {
  // Run all of the provided tests. `failfortests` is not used to treat
  // test failures and command failures separately.
  const tastRun = await chrootService.exec(
    'tast',
    ['run', ...extraArgs, target, ...testNames],
    {
      sudoReason: 'to run tast tests',
      logger: context.output,
      // Allow the user to see the logs during the command execution.
      logStdout: true,
      cancellationToken: token,
    }
  );
  if (token.isCancellationRequested) {
    return {
      status: 'cancel',
    };
  }
  if (tastRun instanceof Error) {
    return {
      status: 'error',
      error: tastRun,
    };
  }

  return {
    status: 'run',
    results: await readResultsJson(context, chrootService),
  };
}

async function readResultsJson(
  context: CommandContext,
  chrootService: ChrootService
): Promise<ExtTestResult[] | Error> {
  const readResultJson = await chrootService.exec(
    'cat',
    ['/tmp/tast/results/latest/results.json'],
    {
      sudoReason: 'to read test results',
      logger: context.output,
    }
  );
  if (readResultJson instanceof Error) {
    return readResultJson;
  }
  try {
    const rawResults: TestResult[] = JSON.parse(readResultJson.stdout);
    return rawResults.map(r => ({
      result:
        r.errors !== null
          ? 'failed'
          : r.skipReason !== ''
          ? 'skipped'
          : 'passed',
      ...r,
    }));
  } catch (e) {
    return e as Error;
  }
}
