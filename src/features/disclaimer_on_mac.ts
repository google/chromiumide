// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as config from '../../shared/app/services/config';
import {getPlatform} from '../common/platform';

/**
 * Shows disclaimer when the extension is directly running on Mac.
 */
export class DisclaimerOnMac implements vscode.Disposable {
  private readonly onDidFinishCheckEmitter = new vscode.EventEmitter<void>();
  readonly onDidFinishCheck = this.onDidFinishCheckEmitter.event;

  constructor() {
    // Call the function after the constructor returns to allow tests to subscribe to events.
    setImmediate(() => {
      void this.showWarningOnMac();
    });
  }

  async showWarningOnMac(): Promise<void> {
    const isMac = getPlatform() === 'darwin';
    if (isMac && config.disclaimerOnMac.enabled.get()) {
      const dontShowAgain = "Don't show again";
      const choice = await vscode.window.showWarningMessage(
        'ChromiumIDE is installed on Mac (not officially supported platform). Maybe you meant to install it on a remote workstation (see [our guide](http://go/chromiumide-on-mac)); ignore it if your are a Mac developer',
        'Ok',
        dontShowAgain
      );
      if (choice === dontShowAgain) {
        await config.disclaimerOnMac.enabled.update(false);
      }
    }

    this.onDidFinishCheckEmitter.fire();
  }

  dispose(): void {
    this.onDidFinishCheckEmitter.dispose();
  }
}
