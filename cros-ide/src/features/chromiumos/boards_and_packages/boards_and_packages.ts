// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ChrootService} from '../../../services/chromiumos';
import {StatusManager, TaskStatus} from '../../../ui/bg_task_status';
import {registerCommands} from './command';
import {Breadcrumbs} from './item';
import {BoardsAndPackagesTreeDataProvider} from './tree_data_provider';

/**
 * The entry point of the boards and packages feature.
 */
export class BoardsAndPackages implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];

  private readonly treeDataProvider: BoardsAndPackagesTreeDataProvider;
  private readonly treeView: vscode.TreeView<Breadcrumbs>;

  constructor(chrootService: ChrootService, statusManager: StatusManager) {
    const output = vscode.window.createOutputChannel('Boards and packages');
    this.subscriptions.push(output);

    statusManager.setTask('Boards and packages', {
      status: TaskStatus.OK,
      outputChannel: output,
    });

    this.treeDataProvider = new BoardsAndPackagesTreeDataProvider(
      chrootService,
      output
    );

    this.treeView = vscode.window.createTreeView('boards-and-packages', {
      treeDataProvider: this.treeDataProvider,
    });
    this.subscriptions.push(this.treeView);

    this.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('chromiumide.board')) {
          this.treeDataProvider.refresh();
        }
      })
    );

    this.subscriptions.push(
      registerCommands({
        chrootService,
        output,
      })
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  getTreeDataProviderForTesting(): vscode.TreeDataProvider<Breadcrumbs> {
    return this.treeDataProvider;
  }

  getTreeViewForTesting(): vscode.TreeView<Breadcrumbs> {
    return this.treeView;
  }
}
