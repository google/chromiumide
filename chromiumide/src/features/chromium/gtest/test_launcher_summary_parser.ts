// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

type TestLauncherSummaryStatus =
  | 'UNKNOWN'
  | 'SUCCESS'
  | 'FAILURE'
  | 'FAILURE_ON_EXIT'
  | 'CRASH'
  | 'TIMEOUT'
  | 'SKIPPED'
  | 'EXCESSIVE_OUTPUT'
  | 'NOTRUN';

type TestLauncherSummary = {
  all_tests: string[];
  disabled_tests: string[];
  global_tags: string[];
  per_iteration_data: Array<
    Record<
      string, // full test name (e.g., Inst/Foo.Bar/Baz)
      Array<{
        elapsed_time_ms: number;
        losless_snippet: boolean; // This appears to be a typo in the test launcher code.
        output_snippet: string;
        output_snippet_base64: string;
        process_num: number;
        result_parts: Array<{
          file: string;
          line: number;
          lossless_message: boolean;
          lossless_summary: boolean;
          message: string;
          message_base64: string;
          summary: string;
          summary_base64: string;
          type: string;
        }>;
        status: TestLauncherSummaryStatus;

        thread_id: number;
        timestamp: string;
      }>
    >
  >;
  test_locations: Record<
    string, // test name
    {file: string; line: number}
  >;
};

export type TestSummaryResult = {
  status: TestLauncherSummaryStatus;
  duration: number;
  errors: vscode.TestMessage[];
};
// A map from full test names to test results. The test names include the full name of the test,
// including parametrization, such as: FooTest.TestFoo, All/FooTest.TestFoo/0, FooTest.TestFoo/Bar,
// All/FooTest/0.Bar.
export type TestSummaryResults = Map<string, TestSummaryResult>;

/**
 * Parses a Chromium test launcher summary JSON structure into `TestSummaryResults`.
 *
 * @param outPath The path of the build directory.
 * @param summaryJson The contents of the file specified with `--test-launcher-summary-output`
 * @returns A map from test names to test results.
 */
export function parseTestLauncherSummary(
  outPath: vscode.Uri,
  summaryJson: string
): TestSummaryResults | Error {
  const testResults: TestSummaryResults = new Map();
  const rawResults: TestLauncherSummary = JSON.parse(summaryJson);

  // TODO(cmfcmf): Figure out when there might be more than one iteration.
  const iteration = rawResults.per_iteration_data[0];
  if (!iteration) {
    return new Error(
      'Test launcher summary appears to not contain any "per_iteration_data".'
    );
  }
  for (const [testName, runs] of Object.entries(iteration)) {
    // TODO(cmfcmf): Figure out when there might be more than one run.
    const run = runs[0];
    if (!run) {
      return new Error(
        'Test launcher summary appears to not have an iteration without runs.'
      );
    }

    const testResult: TestSummaryResult = {
      duration: run.elapsed_time_ms,
      errors: [],
      status: run.status,
    };

    for (const error of run.result_parts) {
      const message = new vscode.TestMessage(error.message);
      // All file paths are relative to the output directory.
      const uri = vscode.Uri.joinPath(outPath, error.file);
      const range = new vscode.Range(
        error.line - 1,
        0,
        error.line - 1,
        Number.MAX_SAFE_INTEGER
      );
      message.location = new vscode.Location(uri, range);
      testResult.errors.push(message);
    }
    testResults.set(testName, testResult);
  }

  return testResults;
}
