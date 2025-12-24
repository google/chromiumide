// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {GtestWorkspace} from './gtest_workspace';

/**
 * Base class for gtest test runners. Subclasses should implement `doRun`.
 */
export abstract class AbstractRunner {
  constructor(
    protected readonly request: vscode.TestRunRequest,
    protected readonly cancellation: vscode.CancellationToken,
    protected readonly testRun: vscode.TestRun,
    protected readonly gtestWorkspace: GtestWorkspace
  ) {}

  protected readonly output = {
    append: (x: string): void =>
      this.testRun.appendOutput(x.replace(/\r?\n/g, '\r\n')),
    appendLine: (x: string): void => this.output.append(x + '\n'),
  };

  async run(): Promise<void> {
    await vscode.commands.executeCommand('testing.showMostRecentOutput');
    if (this.cancellation.isCancellationRequested) {
      return;
    }
    await this.doRun();
    this.testRun.end();
  }

  protected abstract doRun(): Promise<void>;
}
