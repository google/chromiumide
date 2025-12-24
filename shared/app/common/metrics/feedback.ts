// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Platform} from '../../../driver';
import {getDriver} from '../driver_repository';
import {vscodeRegisterCommand} from '../vscode/commands';

const driver = getDriver();

export function activate(context: vscode.ExtensionContext): void {
  if (driver.platform() === Platform.VSCODE) {
    activateVscode(context);
  } else {
    // Activate feature with cider feedback API.
    driver.activateFeedback(context);
  }
}

function activateVscode(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscodeRegisterCommand('chromiumide.fileIdeBug', () => {
      void vscode.env.openExternal(
        vscode.Uri.parse('http://go/chromiumide-new-bug')
      );
    })
  );
}
