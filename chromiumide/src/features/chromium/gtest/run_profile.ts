// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as config from '../../../services/config';
import {GtestWorkspace} from '../../gtest/gtest_workspace';
import {TestControllerSingleton} from '../../gtest/test_controller_singleton';
import {Runner} from './runner';

/**
 * Handles requests to run tests.
 */
export class RunProfile implements vscode.Disposable {
  constructor(
    private readonly srcPath: string,
    private readonly testControllerRepository: TestControllerSingleton
  ) {}

  private readonly gtestWorkspace = new GtestWorkspace(
    () => this.testControllerRepository.getOrCreate(),
    this.srcPath
  );

  private readonly subscriptions: vscode.Disposable[] = [
    this.gtestWorkspace,
    // Creates a test run profile associated with the test controller only when
    // the controller is actually needed (i.e. there is a test).
    this.testControllerRepository.onDidCreate(controller => {
      this.initialize(controller);
    }),
  ];
  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  private initialize(controller: vscode.TestController) {
    const runProfile = controller.createRunProfile(
      'gtest',
      vscode.TestRunProfileKind.Run,
      this.runHandler.bind(this, controller),
      /* isDefault = */ true
    );
    runProfile.configureHandler = this.configureHandler.bind(this);
    this.subscriptions.push(runProfile);
  }

  private async runHandler(
    controller: vscode.TestController,
    request: vscode.TestRunRequest,
    cancellation: vscode.CancellationToken
  ) {
    const runner = new Runner(
      this.srcPath,
      controller,
      request,
      cancellation,
      this.gtestWorkspace
    );
    await runner.run();
  }

  private configureHandler() {
    // VSCode does not support async configure handlers, thus ignore the Promise result.
    void this.asyncConfigureHandler();
  }

  private async asyncConfigureHandler() {
    const result = await vscode.window.showQuickPick(['yes', 'no'], {
      canPickMany: false,
      title: 'Run tests in parallel',
    });
    if (result === 'yes') {
      await config.chrome.gtest.botMode.update(true);
    } else if (result === 'no') {
      await config.chrome.gtest.botMode.update(false);
    }
  }
}
