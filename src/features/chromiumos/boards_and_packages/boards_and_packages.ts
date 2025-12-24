// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {assertNever} from '../../../../shared/app/common/typecheck';
import * as config from '../../../../shared/app/services/config';
import {
  StatusManager,
  TaskStatus,
} from '../../../../shared/app/ui/bg_task_status';
import {ChrootService} from '../../../services/chromiumos';
import {ActivePackageRevealer} from './active_package_revealer';
import {BoardsAndPackagesCommands, CommandName} from './command';
import {Breadcrumbs} from './item';
import {BoardsAndPackagesTreeDataProvider} from './tree_data_provider';

/**
 * The entry point of the boards and packages feature.
 */
export class BoardsAndPackages implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];

  private readonly treeDataProvider: BoardsAndPackagesTreeDataProvider;
  private readonly treeView: vscode.TreeView<Breadcrumbs>;

  /**
   * Tests instantiating this class should subscribe to this event and should finish only after the
   * event is received; otherwise, in-flight operations might continue running after the test
   * finishes and that could cause flakiness.
   */
  get onDidDispose(): vscode.Event<void> {
    return this.treeDataProvider.onDidDispose;
  }

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
    this.subscriptions.push(this.treeDataProvider);

    this.treeView = vscode.window.createTreeView('boards-and-packages', {
      treeDataProvider: this.treeDataProvider,
    });
    this.subscriptions.push(this.treeView);

    // Register a handler to reveal the package for the active file.
    this.subscriptions.push(
      new ActivePackageRevealer(
        chrootService,
        this.treeView,
        this.treeDataProvider
      )
    );

    // Register commands.
    const commands = new BoardsAndPackagesCommands({
      chrootService,
      output,
    });
    this.subscriptions.push(commands);

    // Register handlers to refresh the view.
    this.subscriptions.push(
      config.board.onDidChange(() => this.treeDataProvider.refresh()),
      config.boardsAndPackages.favoriteCategories.onDidChange(() =>
        this.treeDataProvider.refresh()
      ),
      config.boardsAndPackages.favoritePackages.onDidChange(() =>
        this.treeDataProvider.refresh()
      ),
      commands.onDidExecuteCommand(command => {
        switch (command) {
          // Do nothing if the command wouldn't affect the boards and packages view, or the event
          // will be handled in other places. e.g. the default board change is handled by another
          // handler, so we do nothing for SET_DEFAULT_BOARD here.
          case CommandName.BUILD_IMAGE:
          case CommandName.BUILD_PACKAGES:
          case CommandName.SET_DEFAULT_BOARD:
          case CommandName.FAVORITE_ADD:
          case CommandName.FAVORITE_DELETE:
          case CommandName.OPEN_EBUILD:
          case CommandName.BUILD:
          case CommandName.BUILD_WITH_FLAGS:
            return;
          case CommandName.CROS_WORKON_START:
          case CommandName.CROS_WORKON_STOP:
            this.treeDataProvider.refresh();
            return;
          default:
            assertNever(command);
        }
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
