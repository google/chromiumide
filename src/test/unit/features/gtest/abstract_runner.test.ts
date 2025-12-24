// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {AbstractRunner} from '../../../../features/gtest/abstract_runner';
import {GtestWorkspace} from '../../../../features/gtest/gtest_workspace';

class MyRunner extends AbstractRunner {
  getOutputForTesting(): AbstractRunner['output'] {
    return this.output;
  }

  protected override doRun(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}

describe('Gtest AbstractRunner', () => {
  it('passes output through to vscode.TestRun', () => {
    const testRun = jasmine.createSpyObj<vscode.TestRun>(['appendOutput']);

    const runner = new MyRunner(
      {} as unknown as vscode.TestRunRequest,
      new vscode.CancellationTokenSource().token,
      testRun,
      {} as GtestWorkspace
    );
    runner.getOutputForTesting().append('test');
    runner.getOutputForTesting().append('abc\n');
    runner.getOutputForTesting().append('123\r\n');
    expect(testRun.appendOutput).toHaveBeenCalledWith('test');
    expect(testRun.appendOutput).toHaveBeenCalledWith('abc\r\n');
    expect(testRun.appendOutput).toHaveBeenCalledWith('123\r\n');
  });
});
