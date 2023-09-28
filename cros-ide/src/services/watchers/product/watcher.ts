// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {chromiumRoot} from '../../../common/chromium/fs';
import {chromiumosRoot} from '../../../common/chromiumos/fs';
import * as commonUtil from '../../../common/common_util';
import {Metrics} from '../../../features/metrics/metrics';

/**
 * Watches workspace and fires event when the status of whether the workspace
 * contains a folder for the specified product (e.g. chromiumos) changes.
 * In other words, an event is fired in the following event:
 * - The number of the workspace folders containing the product source code becomes 1 from 0.
 * - The number of the workspace folders containing the product source code becomes 0 from 1.
 */
export class ProductWatcher implements vscode.Disposable {
  private root: string | undefined = undefined;
  /**
   * Maps product root directory to the number of workspace folders under
   * the root. If the number reaches zero, the entry should be removed.
   * It's used to trigger events in an appropriate timing. For example when the
   * map becomes empty, we fire an event to tell there is no product root
   * to use.
   */
  private readonly rootCount = new Map<string, number>();
  private shownMultipleRootsError = false;

  private readonly onDidChangeRootEmitter = new vscode.EventEmitter<
    string | undefined
  >();
  /**
   * Fired with the absolute path to the product root to use or undefined
   * if there is no product root to use.
   */
  readonly onDidChangeRoot = this.onDidChangeRootEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidChangeRootEmitter,
  ];

  constructor(readonly product: 'chromium' | 'chromiumos') {
    this.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(async e => {
        if (e.added.length > 0) {
          await this.add(e.added);
        }
        if (e.removed.length > 0) {
          await this.remove(e.removed);
        }
      }),
      vscode.workspace.onDidOpenTextDocument(async e => {
        if (this.root) {
          return;
        }
        if (e.uri.scheme !== 'file') {
          return;
        }
        const root = await this.productRoot(e.uri);
        if (!root) {
          return;
        }
        await this.handleNoWorkspaceFolder(e.fileName, root);
      })
    );

    // Allow ones that subscribe this class immediately after its instantiation
    // to receive the events.
    setImmediate(() => {
      if (vscode.workspace.workspaceFolders) {
        void this.add(vscode.workspace.workspaceFolders);
      }
    });
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  private async productRoot(uri: vscode.Uri): Promise<string | undefined> {
    switch (this.product) {
      case 'chromium':
        return await chromiumRoot(uri.fsPath);
      case 'chromiumos':
        return await chromiumosRoot(uri.fsPath);
      default:
        ((_: never) => {})(this.product);
    }
  }

  private async add(folders: readonly vscode.WorkspaceFolder[]) {
    const prevRoot = this.root;

    for (const folder of folders) {
      const root = await this.productRoot(folder.uri);
      if (!root) {
        continue;
      }

      const prevCount = this.rootCount.get(root) || 0;
      this.rootCount.set(root, prevCount + 1);

      if (!this.root) {
        this.root = root;
        continue;
      }
      if (this.root === root) {
        continue;
      }

      if (this.shownMultipleRootsError) {
        continue;
      }
      this.shownMultipleRootsError = true;

      void vscode.window.showErrorMessage(
        `ChromiumIDE does not support multiple ${
          this.product
        } repositories, but found: [${[this.root, root].join(
          ', '
        )}]. Selecting ${this.root}. ` +
          `Open at most one ${this.product} sources per workspace to fix this problem.`
      );
      Metrics.send({
        category: 'background',
        group: 'misc',
        description: `multiple ${this.product} candidates (product watcher)`,
        name: 'product_watcher_multiple_products',
      });
    }

    if (prevRoot !== this.root) {
      this.onDidChangeRootEmitter.fire(this.root);
    }
  }

  private async remove(folders: readonly vscode.WorkspaceFolder[]) {
    const prevRoot = this.root;

    for (const folder of folders) {
      const root = await this.productRoot(folder.uri);
      if (!root) {
        continue;
      }

      const count = this.rootCount.get(root)!;
      if (count > 1) {
        this.rootCount.set(root, count - 1);
        continue;
      }
      this.rootCount.delete(root);
      if (this.root !== root) {
        continue;
      }

      if (this.rootCount.size === 0) {
        this.root = undefined;
        continue;
      }
      // Map keys in JS are returned in insertion order.
      this.root = [...this.rootCount.keys()][0];
    }

    if (prevRoot !== this.root) {
      this.onDidChangeRootEmitter.fire(this.root);
    }
  }

  private noWorkspaceHandled = false;
  private async handleNoWorkspaceFolder(fileName: string, productRoot: string) {
    if (this.noWorkspaceHandled) {
      return;
    }
    this.noWorkspaceHandled = true;

    const gitFolder = commonUtil.findGitDir(fileName);

    const openGitFolder = gitFolder
      ? `Open ${path.relative(productRoot, gitFolder)}`
      : undefined;
    const openOtherFolder = gitFolder ? 'Open Other' : 'Open Folder';

    const buttons = openGitFolder ? [openGitFolder] : [];
    buttons.push(openOtherFolder);

    const selection = await vscode.window.showErrorMessage(
      `ChromiumIDE expects a workspace folder with ${this.product} sources`,
      ...buttons
    );

    if (selection === openOtherFolder) {
      await vscode.commands.executeCommand('vscode.openFolder', undefined);
    } else if (gitFolder && selection === openGitFolder) {
      await vscode.commands.executeCommand(
        'vscode.openFolder',
        vscode.Uri.file(gitFolder)
      );
    }
  }
}
