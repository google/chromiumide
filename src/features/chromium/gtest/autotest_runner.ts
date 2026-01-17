// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../../shared/app/common/common_util';
import {extraEnvForDepotTools} from '../../../../shared/app/common/depot_tools';
import {AbstractRunner} from '../../testing/abstract_runner';
import {GtestWorkspace} from '../../testing/gtest/gtest_workspace';
import * as outputDirectories from '../output_directories';

/**
 * Runs tests using tools/autotest.py.
 */
export class AutotestRunner extends AbstractRunner {
  constructor(
    private readonly srcPath: string,
    private readonly controller: vscode.TestController,
    request: vscode.TestRunRequest,
    cancellation: vscode.CancellationToken,
    gtestWorkspace: GtestWorkspace
  ) {
    const testRun = controller.createTestRun(request);
    super(request, cancellation, testRun, gtestWorkspace);
  }

  protected override async doRun(): Promise<void> {
    const testCases = Array.from(
      this.gtestWorkspace.matchingTestCases(this.request)
    );

    if (testCases.length === 0) {
      this.output.appendLine('No tests found to run.');
      return;
    }

    testCases.forEach(tc => this.testRun.enqueued(tc.item));

    const scriptPath = path.join(this.srcPath, 'tools', 'autotest.py');
    const outDir = outputDirectories.CURRENT_LINK_NAME;

    // Construct command:
    // > tools/autotest.py -C out/current_link TestSuite.TestName
    const args = ['-C', outDir, ...testCases.map(tc => tc.getGtestFilter())];

    this.output.appendLine(`Executing: ${scriptPath} ${args.join(' ')}`);

    testCases.forEach(tc => this.testRun.started(tc.item));

    const result = await commonUtil.exec(scriptPath, args, {
      cwd: this.srcPath,
      extraEnv: await extraEnvForDepotTools(),
      logger: this.output,
      logStdout: true,
      cancellationToken: this.cancellation,
    });

    if (result instanceof Error) {
      this.output.appendLine(`Execution failed: ${result.message}`);
      testCases.forEach(tc =>
        this.testRun.errored(tc.item, new vscode.TestMessage(result.message))
      );
      return;
    }

    if (result.exitStatus === 0) {
      testCases.forEach(tc => this.testRun.passed(tc.item));
    } else {
      // TODO(b/474269560): Differentiate the multiple tests execution result.
      testCases.forEach(tc =>
        this.testRun.failed(tc.item, new vscode.TestMessage('Test failed.'))
      );
    }
  }
}
