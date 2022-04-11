// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import * as cros from '../common/cros';
import * as ideUtilities from '../ide_utilities';

export async function activate() {
  const boardPackageProvider = new BoardPackageProvider();

  vscode.commands.registerCommand('cros-ide.crosWorkonStart', crosWorkonStart);
  vscode.commands.registerCommand('cros-ide.crosWorkonStop', crosWorkonStop);

  vscode.commands.registerCommand(
      'cros-ide.refreshBoardsPackages',
      () => boardPackageProvider.refresh(),
  );

  vscode.commands.registerCommand(
      'cros-ide.dismissBoardsPkgsWelcome', async () => {
        await ideUtilities.getConfigRoot().update(
            CONFIG_SHOW_WELCOME_MESSAGE, false, vscode.ConfigurationTarget.Global);
        boardPackageProvider.refresh();
      },
  );

  vscode.window.registerTreeDataProvider(
      'boards-packages',
      boardPackageProvider,
  );

  await createPackageWatches();
}

const CONFIG_SHOW_WELCOME_MESSAGE = 'boardsAndPackages.showWelcomeMessage';

// TODO: Write a unit test for watching packages.
async function createPackageWatches() {
  const boards = await cros.getSetupBoardsAlphabetic();
  const crosWorkonDir = path.join(os.homedir(), 'chromiumos/.config/cros_workon/');

  // Watching for non-existent directory throws errors,
  // which happens when we run tests outside chroot.
  if (!fs.existsSync(crosWorkonDir)) {
    return;
  }

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
  const res = await commonUtil.exec('cros_workon', [`--board=${boardName}`, cmd, pkgName],
      ideUtilities.getUiLogger().append, {logStdout: true, ignoreNonZeroExit: true});
  if (res instanceof Error) {
    throw res;
  }
  const {exitStatus, stderr} = res;
  if (exitStatus !== 0) {
    vscode.window.showErrorMessage(`cros_workon failed: ${stderr}`);
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
    // Welcome messages are shown when there are no elements, so return an empty result
    // even if there are boards in the chroot message is dismissed.
    if (ideUtilities.getConfigRoot().get(CONFIG_SHOW_WELCOME_MESSAGE)) {
      return [];
    }

    if (element === undefined) {
      return (await cros.getSetupBoardsAlphabetic()).map(x => new Board(x));
    }
    if (element && element instanceof Board) {
      return (await getWorkedOnPackages(element.name)).map(x =>
        new Package(element, x));
    }
    return [];
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

/**
 * @returns Packages that are worked on.
 */
async function getWorkedOnPackages(board: string): Promise<string[]> {
  const res = await commonUtil.exec('cros_workon', ['--board', board, 'list'],
      ideUtilities.getUiLogger().append, {logStdout: true});
  if (res instanceof Error) {
    throw res;
  }
  return res.stdout.split('\n').filter(x => x.trim() !== '');
}
