// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from './common/common_util';
import * as cros from './common/cros';

export async function activate() {
  const boardPackageProvider = new BoardPackageProvider();

  vscode.commands.registerCommand('cros-ide.crosWorkonStart', crosWorkonStart);
  vscode.commands.registerCommand('cros-ide.crosWorkonStop', crosWorkonStop);

  vscode.commands.registerCommand(
      'cros-ide.refreshBoardsPackages',
      () => boardPackageProvider.refresh(),
  );

  vscode.window.registerTreeDataProvider(
      'boards-packages',
      boardPackageProvider,
  );

  await createPackageWatches();
}

// TODO: Write a unit test for watching packages.
async function createPackageWatches() {
  const boards = await cros.getSetupBoardsAlphabetic();
  const crosWorkonDir = path.join(os.homedir(), 'chromiumos/.config/cros_workon/');
  fs.watch(crosWorkonDir, (eventType, fileName) => {
    // Multiple files can be changed. This restrictions limits the number of refreshes to one.
    if (boards.includes(fileName)) {
      vscode.commands.executeCommand('cros-ide.refreshBoardsPackages');
    }
  });
}

async function crosWorkonStart(board: Board) {
  const pkgName = await vscode.window.showInputBox({
    title: 'Package',
    placeHolder: 'package, e.g. chromeos-base/shill',
  });

  if (!pkgName) {
    return;
  }

  crosWorkon(board.name, 'start', pkgName);
}

function crosWorkonStop(pkg: Package) {
  crosWorkon(pkg.board.name, 'stop', pkg.name);
}

async function crosWorkon(boardName: string, cmd: string, pkgName: string) {
  try {
    await commonUtil.exec('cros_workon', [`--board=${boardName}`, cmd, pkgName]);
  } catch (e) {
    // TODO(b/223535757): Show stderr in the message.
    vscode.window.showErrorMessage('cros_workon failed: ' + e);
  }
}

/**
 * Provides two-level tree. The top level are boards set up with
 * `setup_board --board=${BOARD}`, under each board we show packages
 * that are `cros_work start`-ed.
 */
class BoardPackageProvider implements vscode.TreeDataProvider<ChrootItem> {
  private onDidChangeTreeDataEmitter =
    new vscode.EventEmitter<ChrootItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  async getChildren(element?: ChrootItem): Promise<ChrootItem[]> {
    if (element === undefined) {
      return (await cros.getSetupBoardsAlphabetic()).map(x => new Board(x));
    }
    if (element && element instanceof Board) {
      return (await cros.getWorkedOnPackages(element.name)).map(x =>
        new Package(element, x));
    }
    return Promise.resolve([]);
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

  contextValue = 'board';
  iconPath = new vscode.ThemeIcon('circuit-board');
}

class Package extends ChrootItem {
  constructor(readonly board: Board, readonly name: string) {
    super(name, vscode.TreeItemCollapsibleState.None);
  }

  contextValue = 'package';
  iconPath = new vscode.ThemeIcon('package');
}
