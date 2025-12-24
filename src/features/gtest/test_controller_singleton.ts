// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

/**
 * Holds shared test controller instance. It creates the test controller lazily
 * when requested.
 *
 * TODO(oka): Consider disposing the controller once all the gtest files are
 * closed.
 */
export class TestControllerSingleton implements vscode.Disposable {
  private readonly onDidCreateEmitter =
    new vscode.EventEmitter<vscode.TestController>();
  /**
   * Fires when the controller is created.
   */
  readonly onDidCreate = this.onDidCreateEmitter.event;

  private controller?: vscode.TestController;

  /**
   * @param id Identifier for the `vscode.TestController`, must be globally unique.
   * @param label A human-readable label for the `vscode.TestController`.
   */
  constructor(private readonly id: string, private readonly label: string) {}

  dispose(): void {
    this.controller?.dispose();
    this.onDidCreateEmitter.dispose();
  }

  /**
   * Creates a controller and fires onDidCreate, or returns an existing controller.
   */
  getOrCreate(): vscode.TestController {
    if (!this.controller) {
      this.controller = vscode.tests.createTestController(this.id, this.label);
      this.onDidCreateEmitter.fire(this.controller);
    }
    return this.controller;
  }
}
