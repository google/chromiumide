// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

const CONFLICTING_EXTENSIONS = [
  'redhat.java',
  'Oracle.oracle-java',
  'georgewfraser.vscode-javac',
];

export function checkConflictingExtensions(): void {
  for (const extensionId of CONFLICTING_EXTENSIONS) {
    const extension = vscode.extensions.getExtension(extensionId);
    if (!extension) {
      continue;
    }

    const name =
      extension.packageJSON?.displayName && extension.packageJSON?.publisher
        ? `${extension.packageJSON.displayName} by ${extension.packageJSON.publisher}`
        : extension.id;
    void (async () => {
      const OPEN_EXTENSION = 'Open extension page';
      const choice = await vscode.window.showInformationMessage(
        `Chromium Java support: We recommend disabling a conflicting Java extension: ${name}`,
        OPEN_EXTENSION,
        'Ignore'
      );
      if (choice === OPEN_EXTENSION) {
        void vscode.commands.executeCommand('extension.open', extension.id);
      }
    })();
  }
}
