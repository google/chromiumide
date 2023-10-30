// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as ideUtil from '../../../ide_util';
import {GtestWorkspace} from '../../gtest/gtest_workspace';
import {Config} from './config';
import {Runner} from './runner';

/**
 * Handles requests to run tests.
 */
export class RunProfile implements vscode.Disposable {
  constructor(private readonly cfg: Config) {}

  private readonly gtestWorkspace = new GtestWorkspace(
    () => this.cfg.testControllerRepository.getOrCreate(),
    this.cfg.platform2
  );

  private readonly subscriptions: vscode.Disposable[] = [
    this.gtestWorkspace,
    // Creates a test run profile associated with the test controller only when
    // the controller is actually needed (i.e. there is a test).
    this.cfg.testControllerRepository.onDidCreate(controller => {
      this.initialize(controller);
    }),
  ];
  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  private initialize(controller: vscode.TestController) {
    this.subscriptions.push(
      controller.createRunProfile(
        'GTest',
        vscode.TestRunProfileKind.Run,
        this.runHandler.bind(this, controller),
        /* isDefault = */ true
      ),
      controller.createRunProfile(
        'GTest (Debug)',
        vscode.TestRunProfileKind.Debug,
        this.runHandler.bind(this, controller)
      )
    );
  }

  private async runHandler(
    controller: vscode.TestController,
    request: vscode.TestRunRequest,
    cancellation: vscode.CancellationToken
  ) {
    const board = await ideUtil.getOrSelectTargetBoard(
      this.cfg.chrootService.chroot
    );
    if (board === null || board instanceof ideUtil.NoBoardError) {
      // TODO(oka): Handle error.
      return;
    }

    if (cancellation.isCancellationRequested) {
      return;
    }

    const run = controller.createTestRun(request);
    const runner = new Runner(
      this.cfg.chrootService,
      request,
      cancellation,
      run,
      board,
      this.gtestWorkspace
    );
    await runner.run();
  }
}
