// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {TestControllerSingleton} from '../../gtest/test_controller_singleton';
import {RunProfile} from './run_profile';

export class ChromiumGtest implements vscode.Disposable {
  constructor(private readonly srcPath: string) {}

  private readonly testControllerRepository = new TestControllerSingleton(
    'chromiumide.chromiumGtest',
    'Chromium gtest'
  );

  private readonly subscriptions: vscode.Disposable[] = [
    this.testControllerRepository,
    new RunProfile(this.srcPath, this.testControllerRepository),
  ];
  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  getTestControllerForTesting(): vscode.TestController {
    return this.testControllerRepository.getOrCreate();
  }
}
