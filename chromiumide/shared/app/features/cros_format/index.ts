// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {extensionName} from '../../common/extension_name';
import {StatusManager, TaskStatus} from '../../ui/bg_task_status';
import {maybeConfigureOrSuggestSettingDefaultFormatter} from './default_formatter';
import {CrosFormatEditProvider, FORMATTER} from './formatting_edit_provider';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: StatusManager
): void {
  const output = vscode.window.createOutputChannel(
    `${extensionName()}: Formatter`
  );
  statusManager.setTask(FORMATTER, {
    status: TaskStatus.OK,
    outputChannel: output,
  });

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      [{scheme: 'file'}],
      new CrosFormatEditProvider(statusManager, output)
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(e =>
      maybeConfigureOrSuggestSettingDefaultFormatter(
        e.added,
        context.extension.id,
        output
      )
    )
  );
  void maybeConfigureOrSuggestSettingDefaultFormatter(
    vscode.workspace.workspaceFolders ?? [],
    context.extension.id,
    output
  );
}
