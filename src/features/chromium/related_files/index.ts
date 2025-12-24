// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../../../../shared/app/common/vscode/commands';
import {CppRelatedFilesProvider} from './cpp';
import {PreprocessedFilesCodeLensProvider} from './preprocessed';

export function activate(
  context: vscode.ExtensionContext,
  srcDir: string
): void {
  context.subscriptions.push(
    vscodeRegisterCommand(
      'chromiumide.relatedFiles.create',
      async (uri: unknown) => {
        if (!(uri instanceof vscode.Uri)) {
          return;
        }
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.createFile(uri, {
          ignoreIfExists: true,
          overwrite: false,
        });
        const success = await vscode.workspace.applyEdit(workspaceEdit);
        if (!success) {
          return vscode.window.showErrorMessage(
            `Unable to create related file: ${uri}.`
          );
        }
        return vscode.commands.executeCommand('vscode.open', uri);
      }
    )
  );

  context.subscriptions.push(
    CppRelatedFilesProvider.activate(srcDir),
    PreprocessedFilesCodeLensProvider.activate(srcDir)
  );
}
