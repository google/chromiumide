// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';

export function activate() {
  const boardPackageProvider = new BoardPackageProvider();

  vscode.window.registerTreeDataProvider(
      'boards-packages',
      boardPackageProvider,
  );

  vscode.commands.registerCommand(
      'cros-ide.refreshBoardsPackages',
      () => boardPackageProvider.refresh(),
  );
}

/**
 * Provides two-level tree. The top level are boards set up with
 * `setup_board --board=${BOARD}`, under each board we show packages
 * that are `cros_work start`-ed.
 *
 * Everything is read-only and does not refresh after the IDE is loaded.
 */
class BoardPackageProvider implements vscode.TreeDataProvider<ChrootItem> {
  private onDidChangeTreeDataEmitter =
    new vscode.EventEmitter<ChrootItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  getChildren(element?: ChrootItem): Thenable<ChrootItem[]> {
    if (element === undefined) {
      return this.getBoards();
    }
    if (element && element instanceof Board) {
      return this.getPackages(element);
    }
    return Promise.resolve([]);
  }

  async getBoards(): Promise<Board[]> {
    const dirs = await fs.promises.readdir('/build')
    return dirs
        .filter(dir => dir !== 'bin')
        .map(dir => new Board(dir));
  }

  async getPackages(board: Board): Promise<Package[]> {
    const cmd = `cros_workon --board=${board.name} list`;
    const {stdout} = await util.promisify(childProcess.exec)(cmd)

    return stdout
        .split(/\r?\n/)
        .filter(line => line.trim() !== '')
        .map(pkg => new Package(pkg));
  }

  getTreeItem(element: ChrootItem): vscode.TreeItem {
    return element;
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }
}

class ChrootItem extends vscode.TreeItem {
}

class Board extends ChrootItem {
  constructor(readonly name: string) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
  }
}

class Package extends ChrootItem {
  constructor(readonly name: string) {
    super(name, vscode.TreeItemCollapsibleState.None);
  }
}
