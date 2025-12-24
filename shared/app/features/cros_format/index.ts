// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {extensionName} from '../../common/extension_name';
import {vscodeRegisterTextEditorCommand} from '../../common/vscode/commands';
import {StatusManager, TaskStatus} from '../../ui/bg_task_status';
import {maybeConfigureOrSuggestSettingDefaultFormatter} from './default_formatter';
import {CrosFormatEditProvider, FORMATTER} from './formatting_edit_provider';

/**
 * Registers handlers related to cros format.
 */
export class CrosFormatFeature implements vscode.Disposable {
  private readonly onDidHandleEventEmitter = new vscode.EventEmitter<void>();
  readonly onDidHandleEvent = this.onDidHandleEventEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidHandleEventEmitter,
  ];

  constructor(extensionId: string, statusManager: StatusManager) {
    const output = vscode.window.createOutputChannel(
      `${extensionName()}: Formatter`
    );

    statusManager.setTask(FORMATTER, {
      status: TaskStatus.OK,
      outputChannel: output,
    });

    const editProvider = new CrosFormatEditProvider(statusManager, output);

    this.subscriptions.push(
      output,
      vscode.languages.registerDocumentFormattingEditProvider(
        [{scheme: 'file'}],
        editProvider
      ),
      vscodeRegisterTextEditorCommand(
        'chromiumide.crosFormat.forceFormat',
        // Can't use the edit parameter in async callback; edit is only valid while callback runs.
        async (editor, _edit) => {
          await (async () => {
            const replace = await editProvider.provideReplace(editor.document, {
              force: true,
            });
            if (!replace) return;

            await editor.edit(edit => {
              edit.replace(replace.location, replace.value);
            });
          })();

          this.onDidHandleEventEmitter.fire();
        }
      ),
      vscode.workspace.onDidChangeWorkspaceFolders(e =>
        maybeConfigureOrSuggestSettingDefaultFormatter(
          e.added,
          extensionId,
          output
        )
      )
    );
    void maybeConfigureOrSuggestSettingDefaultFormatter(
      vscode.workspace.workspaceFolders ?? [],
      extensionId,
      output
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.splice(0).reverse()).dispose();
  }
}
