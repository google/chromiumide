// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {isChromiumosRoot} from '../common/chromiumos/fs';
import {hints} from '../services/config';
import * as sudo from '../services/sudo';
import {Metrics} from './metrics/metrics';

/**
 * Activates the hint handlers.
 *
 * When adding hints on user actions, instead of embedding hint logic into
 * individual modules, you can provide event emitters there and subscribe
 * to them here, by which you can decouple hint logic and individual modules.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    sudo.onDidRunSudoWithPassword(onDidRunSudoWithPassword),
    vscode.workspace.onDidChangeWorkspaceFolders(onDidChangeWorkspaceFolders)
  );

  void onDidChangeWorkspaceFolders({
    added: vscode.workspace.workspaceFolders ?? [],
    removed: [],
  });
}

const maxSudoPasswordIntervalInMilli = 3 * 60 * 60 * 1000; // 3 hours

let lastDidRunSudoWithPassword: Date | undefined = undefined;
let didShowSudoHint = false;

/**
 * Show a hint to set up sudo to request passwords less frequently
 * when the user needed to type passwords twice in a row.
 */
function onDidRunSudoWithPassword(): void {
  const now = new Date();
  if (lastDidRunSudoWithPassword !== undefined) {
    const elapsed = now.getTime() - lastDidRunSudoWithPassword.getTime();
    if (elapsed < maxSudoPasswordIntervalInMilli) {
      if (!didShowSudoHint) {
        void (async () => {
          const choice = await vscode.window.showInformationMessage(
            'You can set up sudo to request passwords less frequently.',
            'Open Documentation'
          );
          if (choice) {
            void vscode.env.openExternal(
              vscode.Uri.parse(
                'https://chromium.googlesource.com/chromiumos/docs/+/HEAD/tips-and-tricks.md#how-to-make-sudo-a-little-more-permissive'
              )
            );
          }
        })();
        didShowSudoHint = true;
      }
    }
  }
  lastDidRunSudoWithPassword = now;
}

const onDidHandleChangeWorkspaceFoldersEmitter =
  new vscode.EventEmitter<void>();
export const onDidHandleChangeWorkspaceFolders =
  onDidHandleChangeWorkspaceFoldersEmitter.event;

async function onDidChangeWorkspaceFolders({
  added,
}: vscode.WorkspaceFoldersChangeEvent): Promise<void> {
  for (const dir of added) {
    if (
      hints.tooLargeWorkspace.get() &&
      (await isChromiumosRoot(dir.uri.fsPath))
    ) {
      Metrics.send({
        category: 'background',
        group: 'hints',
        description: 'show chromiumos workspace warning',
        name: 'hints_show_chromiumos_workspace_warning',
      });

      const openSubdirectory = 'Open subdirectory';
      const dontAskAgain = "Don't ask again";
      const choice = await vscode.window.showWarningMessage(
        'Opening the entire chromiumos directory can cause performance problem; we recommend to open a subdirectory',
        openSubdirectory,
        dontAskAgain
      );
      if (choice === openSubdirectory) {
        const folderUri = await vscode.window.showOpenDialog({
          defaultUri: dir.uri,
          canSelectMany: false,
          openLabel: 'Select',
          canSelectFiles: false,
          canSelectFolders: true,
        });
        if (folderUri) {
          void vscode.commands.executeCommand(
            'vscode.openFolder',
            folderUri[0]
          );
        }
      } else if (choice === dontAskAgain) {
        await hints.tooLargeWorkspace.update(false);

        Metrics.send({
          category: 'interactive',
          group: 'hints',
          description: 'show chromiumos workspace warning',
          name: 'hints_ignore_chromiumos_workspace_warning',
        });
      }
    }
  }
  onDidHandleChangeWorkspaceFoldersEmitter.fire();
}
