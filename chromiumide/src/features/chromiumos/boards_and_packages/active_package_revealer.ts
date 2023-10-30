// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {BoardOrHost} from '../../../common/chromiumos/board_or_host';
import {ParsedPackageName} from '../../../common/chromiumos/portage/ebuild';
import {ChrootService} from '../../../services/chromiumos';
import {ActivePackageWatcher} from './active_package_watcher';
import {Breadcrumbs} from './item';
import {SelectedBoardWatcher} from './selected_board_watcher';
import {BoardsAndPackagesTreeDataProvider} from './tree_data_provider';

/**
 * This class tracks on which board the user it currently working on and reveals the active package
 * under the board. The board to reveal a package under which is the package the user last touch on
 * the boards and packages view.
 */
export class ActivePackageRevealer implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];

  /**
   * Whether the board and package to reveal has been already revealed. This flag is used not to
   * reveal the same board and package in a row, not to steal the selection the user manually sets.
   */
  private revealed = false;

  constructor(
    chrootService: ChrootService,
    private readonly treeView: vscode.TreeView<Breadcrumbs>,
    private readonly treeDataProvider: BoardsAndPackagesTreeDataProvider
  ) {
    const selectedBoard = new SelectedBoardWatcher(treeView);
    this.subscriptions.push(selectedBoard);

    const activePackage = new ActivePackageWatcher(chrootService);
    this.subscriptions.push(activePackage);

    let board = selectedBoard.value;
    let pkg = activePackage.value;

    this.subscriptions.push(
      selectedBoard.onDidChangeSelectedBoard(b => {
        board = b;
        this.revealed = false;
        this.reveal(board, pkg);
      }),
      activePackage.onDidChangeActiveFile(p => {
        pkg = p;
        this.revealed = false;
        this.reveal(board, pkg);
      }),
      // Ensure to select the package when the user expands the items under board by clicking the
      // board item.
      treeView.onDidExpandElement(() => {
        this.reveal(board, pkg);
      })
    );
  }

  private reveal(board?: BoardOrHost, pkg?: ParsedPackageName): void {
    if (!board || !pkg) return;

    if (this.revealed) return;

    // Reveal it only when the category item below the board has been already revealed, because
    // revealing a category level item for the first time requires sudo. Rather than revealing the
    // item no matter what possibly asking the user the password, we reveal the item only when it
    // will be possible without user's intereation.
    const breadcrumbsToCategory = Breadcrumbs.from(
      board.toString(),
      pkg.category
    );
    if (!this.treeDataProvider.isItemInstantiated(breadcrumbsToCategory)) {
      return;
    }

    void this.treeView.reveal(
      Breadcrumbs.from(board.toString(), pkg.category, pkg.name)
    );
    this.revealed = true;
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.splice(0).reverse()).dispose();
  }
}
