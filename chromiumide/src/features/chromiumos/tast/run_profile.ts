// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  DebugTastTestsResult,
  RunTastTestsResult,
} from '../../device_management/commands/tast';

/**
 * Handles requests to run/debug tests.
 */
export class RunProfile implements vscode.Disposable {
  constructor(
    controller: vscode.TestController,
    private readonly debug = false
  ) {
    this.subscriptions.push(
      controller.createRunProfile(
        debug ? 'Tast debug' : 'Tast',
        debug ? vscode.TestRunProfileKind.Debug : vscode.TestRunProfileKind.Run,
        this.runHandler.bind(this, controller),
        /* isDefault = */ debug ? false : true
      )
    );
  }

  private readonly subscriptions: vscode.Disposable[] = [];

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  private async runHandler(
    controller: vscode.TestController,
    request: vscode.TestRunRequest,
    _cancellation: vscode.CancellationToken
  ) {
    const run = controller.createTestRun(request);

    const testItems: vscode.TestItem[] = [];
    if (request.include) {
      request.include.forEach(test => testItems.push(test));
    } else {
      controller.items.forEach(test => testItems.push(test));
    }

    for (const testItem of testItems) {
      run.started(testItem);
      const start = new Date();

      try {
        let runResult;

        if (this.debug) {
          runResult = (await vscode.commands.executeCommand(
            'chromiumide.deviceManagement.debugTastTests'
          )) as DebugTastTestsResult | null | Error;
        } else {
          runResult = (await vscode.commands.executeCommand(
            'chromiumide.deviceManagement.runTastTests'
          )) as RunTastTestsResult | null | Error;
        }

        if (runResult !== null) {
          const duration =
            new Date().getMilliseconds() - start.getMilliseconds();
          run.passed(testItem, duration);
        } else {
          run.skipped(testItem);
        }
      } catch (err) {
        run.failed(
          testItem,
          new vscode.TestMessage(
            'Failed to run the test. View the logs for more details.'
          )
        );
      }
    }

    run.end();
  }
}
