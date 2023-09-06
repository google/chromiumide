// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as config from '../../../services/config';

export function activate(context: vscode.ExtensionContext): void {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );

  statusBarItem.command = {
    title: 'Edit',
    command: 'workbench.action.openSettings',
    arguments: ['@ext:google.cros-ide platformEC'],
  };

  context.subscriptions.push(
    config.platformEc.board.onDidChange(() => updateText(statusBarItem)),
    config.platformEc.mode.onDidChange(() => updateText(statusBarItem)),
    config.platformEc.build.onDidChange(() => updateText(statusBarItem))
  );

  updateText(statusBarItem);
  updateVisibility(statusBarItem);

  context.subscriptions.push(statusBarItem);
}

function updateText(statusBarItem: vscode.StatusBarItem) {
  const board = config.platformEc.board.get();
  if (board) {
    const mode = config.platformEc.mode.get();
    const build = config.platformEc.build.get();
    statusBarItem.text = `${board}:${mode} (${build})`;
  }
}

function updateVisibility(statusBarItem: vscode.StatusBarItem) {
  const folders = vscode.workspace.workspaceFolders?.map(folder => folder.uri);
  const files = vscode.window.visibleTextEditors.map(
    textEditor => textEditor.document.uri
  );
  const paths = folders ? folders.concat(files) : files;
  const visible = paths.find(uri => uri.fsPath.includes('/platform/ec'));
  if (visible) {
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}
