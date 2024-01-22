// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as driver from '../../driver';

/**
 * Show random UUID when a command is invoked.
 *
 * This is a feature for experimenting internal IDE integration and should be removed after a real
 * feature is integrated.
 */
export class DemoRandomUuid implements vscode.Disposable {
  private readonly subscriptions = [
    // TODO(oka): Fix the warning by using the vscodeRegisterCommand method instead.
    // eslint-disable-next-line no-restricted-syntax
    vscode.commands.registerCommand(
      'chromiumideShared.demo.showRandomUuid',
      () => {
        void vscode.window.showInformationMessage(
          `ChromiumIDE Demo: Random UUID is ${driver.node.crypto.randomUUID()}`
        );
      }
    ),
  ];

  constructor() {}

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions);
  }
}
