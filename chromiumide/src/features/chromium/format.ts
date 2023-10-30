// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as common_util from '../../common/common_util';
import * as depotTools from '../../common/depot_tools';
import {vscodeRegisterCommand} from '../../common/vscode/commands';

export function activate(
  context: vscode.ExtensionContext,
  rootPath: string
): void {
  context.subscriptions.push(
    vscodeRegisterCommand(
      'chromiumide.chromium.gitcl.format',
      async (sourceControl: unknown) => {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: 'Running git cl format',
          },
          async (progress, token) => {
            let repoRoots: vscode.Uri[] = [];
            if (
              sourceControl &&
              typeof sourceControl === 'object' &&
              'rootUri' in sourceControl &&
              sourceControl.rootUri instanceof vscode.Uri
            ) {
              // If this command is called from the button in the Source Control view, then the
              // first argument should be an instance of `vscode.SourceControl`. In that case, we
              // run `git cl format` on the respective repo.
              repoRoots = [sourceControl.rootUri];
            } else {
              // If the user executes this command from the command palette, then we run `git cl
              // format` on both the external and internal repos.
              repoRoots = [vscode.Uri.file(path.join(rootPath, 'src'))];

              try {
                const internalRoot = vscode.Uri.file(
                  path.join(rootPath, 'src-internal')
                );
                if (
                  (await vscode.workspace.fs.stat(internalRoot)).type ===
                  vscode.FileType.Directory
                ) {
                  repoRoots.push(internalRoot);
                }
              } catch (err) {
                // Internal repo root does not appear to exist.
              }
            }

            const repoRootsLeftToFormat = new Set(repoRoots);
            function reportProgress(increment: number) {
              progress.report({
                message: `Formatting ${Array.from(repoRootsLeftToFormat).join(
                  ', '
                )}`,
                increment,
              });
            }
            reportProgress(0);

            await Promise.all(
              repoRoots.map(async repoRoot => {
                const result = await common_util.exec('git', ['cl', 'format'], {
                  cwd: repoRoot.fsPath,
                  env: depotTools.envForDepotTools(),
                  cancellationToken: token,
                });
                if (result instanceof Error) {
                  await vscode.window.showErrorMessage(
                    `Unable to run 'git cl format' in ${repoRoot}: ${result}`
                  );
                } else {
                  await vscode.commands.executeCommand('git.refresh', repoRoot);
                }
                repoRootsLeftToFormat.delete(repoRoot);
                reportProgress(100 / repoRoots.length);
              })
            );
          }
        );
      }
    )
  );
}
