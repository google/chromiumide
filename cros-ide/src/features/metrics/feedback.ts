// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('cros-ide.fileIdeBug', () => {
      void vscode.env.openExternal(
        vscode.Uri.parse('http://go/cros-ide-new-bug')
      );
    })
  );

  const feedbackStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    5
  );
  feedbackStatusBarItem.command = 'cros-ide.fileIdeBug';
  feedbackStatusBarItem.text = '$(feedback) Feedback';
  feedbackStatusBarItem.tooltip = 'File a ChromiumIDE bug on Buganizer';
  feedbackStatusBarItem.show();
}
