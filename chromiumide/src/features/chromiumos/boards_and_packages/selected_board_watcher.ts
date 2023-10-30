// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {BoardOrHost} from '../../../common/chromiumos/board_or_host';
import {Breadcrumbs} from './item';

/**
 * This class watches the selection of boards and packages view and fires an event when the board
 * the item under which is selected is changed.
 */
export class SelectedBoardWatcher implements vscode.Disposable {
  private readonly onDidChangeSelectedBoardEmitter =
    new vscode.EventEmitter<BoardOrHost>();
  readonly onDidChangeSelectedBoard =
    this.onDidChangeSelectedBoardEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidChangeSelectedBoardEmitter,
  ];

  private board: BoardOrHost | undefined = undefined;

  get value(): BoardOrHost | undefined {
    return this.board;
  }

  constructor(treeView: vscode.TreeView<Breadcrumbs>) {
    this.subscriptions.push(
      treeView.onDidChangeSelection(({selection}) => {
        if (selection.length === 0) {
          return;
        }
        // BoardsAndPackages doesn't set canSelectMany on creating the treeView, so we can assume
        // the selection contains only one element.
        const board = selection[0].breadcrumbs[0];

        if (this.board?.toString() !== board) {
          this.board = BoardOrHost.parse(board);
          this.onDidChangeSelectedBoardEmitter.fire(this.board);
        }
      })
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.splice(0).reverse()).dispose();
  }
}
