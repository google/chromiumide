// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as install from './tools/install';

export async function run(context: vscode.ExtensionContext) {
  const extenstion = vscode.extensions.getExtension('google.cros-ide');
  // This should not happen.
  if (!extenstion) {
    return;
  }
  const installed = install.versionFromString(extenstion.packageJSON.version);

  const latest = (await install.findArchive()).version;

  if (install.compareVersion(installed, latest) < 0) {
    showNewVersionAvailable(
        install.versionToString(installed), install.versionToString(latest));
  }
}

async function showNewVersionAvailable(installed: string, available: string) {
  const howToUpdate = 'How to update?';
  const selection = await vscode.window.showInformationMessage(
      `New version of CrOS IDE is available (installed: ${installed}, available: ${available}).`,
      'Dismiss', howToUpdate);
  if (selection === howToUpdate) {
    vscode.env.openExternal(vscode.Uri.parse('http://go/cros-ide-quickstart#updating'));
  }
}
