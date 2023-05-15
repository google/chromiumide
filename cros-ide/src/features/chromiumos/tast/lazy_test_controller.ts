// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {RunProfile} from './run_profile';

/**
 * Holds shared test controller instance. It creates the test controller lazily
 * when requested.
 */
export class LazyTestController implements vscode.Disposable {
  private controller?: vscode.TestController;
  private runProfile?: RunProfile;

  dispose() {
    this.runProfile?.dispose();
    this.controller?.dispose();
  }

  /**
   * Creates a controller and fires onDidCreate, or returns an existing controller.
   */
  getOrCreate(): vscode.TestController {
    if (!this.controller) {
      this.controller = vscode.tests.createTestController(
        'cros-ide.tastTest',
        'Tast (ChromiumIDE)'
      );
      this.runProfile = new RunProfile(this.controller);
    }
    return this.controller;
  }
}
