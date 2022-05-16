// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as cros from '../common/cros';
import * as ideUtil from '../ide_util';
import {ChrootService} from '../services/chroot';

export async function activate(chrootService: ChrootService) {
  const boardPackageProvider = new BoardPackageProvider(chrootService);

  vscode.commands.registerCommand('cros-ide.crosWorkonStart', board =>
    crosWorkonStart(chrootService, board)
  );
  vscode.commands.registerCommand('cros-ide.crosWorkonStop', board =>
    crosWorkonStop(chrootService, board)
  );

  vscode.commands.registerCommand('cros-ide.refreshBoardsPackages', () =>
    boardPackageProvider.refresh()
  );

  vscode.commands.registerCommand(
    'cros-ide.dismissBoardsPkgsWelcome',
    async () => {
      await ideUtil
        .getConfigRoot()
        .update(
          CONFIG_SHOW_WELCOME_MESSAGE,
          false,
          vscode.ConfigurationTarget.Global
        );
      boardPackageProvider.refresh();
    }
  );

  vscode.window.registerTreeDataProvider(
    'boards-packages',
    boardPackageProvider
  );

  await createPackageWatches(chrootService);
}

const VIRTUAL_BOARDS_HOST = 'host';
const CONFIG_SHOW_WELCOME_MESSAGE = 'boardsAndPackages.showWelcomeMessage';

// TODO: Write a unit test for watching packages.
async function createPackageWatches(chrootService: ChrootService) {
  const chroot = chrootService.chroot();
  if (!chroot) {
    return;
  }

  const boards = await cros.getSetupBoardsAlphabetic(chroot);
  const crosWorkonDir = '.config/cros_workon/';

  const source = chrootService.source();
  if (!source) {
    return;
  }

  // Watching for non-existent directory throws errors,
  // which happens when we run tests outside chroot.
  if (!source.existsSync(crosWorkonDir)) {
    return;
  }

  source.watchSync(crosWorkonDir, (_eventType, fileName) => {
    // Multiple files can be changed. This restrictions limits the number of refreshes to one.
    if (boards.includes(fileName) || fileName === VIRTUAL_BOARDS_HOST) {
      vscode.commands.executeCommand('cros-ide.refreshBoardsPackages');
    }
  });
}

async function crosWorkonStart(chrootService: ChrootService, board: Board) {
  const pkgName = await vscode.window.showInputBox({
    title: 'Package',
    placeHolder: 'package, e.g. chromeos-base/shill',
  });

  if (!pkgName) {
    return;
  }

  await crosWorkon(chrootService, board.name, 'start', pkgName);
}

async function crosWorkonStop(chrootService: ChrootService, pkg: Package) {
  await crosWorkon(chrootService, pkg.board.name, 'stop', pkg.name);
}

async function crosWorkon(
  chrootService: ChrootService,
  boardName: string,
  cmd: string,
  pkgName: string
) {
  const res = await chrootService.exec(
    'cros_workon',
    [
      boardName === VIRTUAL_BOARDS_HOST ? '--host' : `--board=${boardName}`,
      cmd,
      pkgName,
    ],
    ideUtil.getUiLogger().append,
    {logStdout: true, ignoreNonZeroExit: true}
  );
  if (res instanceof Error) {
    vscode.window.showErrorMessage(res.message);
    return;
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
  private onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    ChrootItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly chrootService: ChrootService) {}

  async getChildren(element?: ChrootItem): Promise<ChrootItem[]> {
    // Welcome messages are shown when there are no elements, so return an empty result
    // even if there are boards in the chroot message is dismissed.
    if (ideUtil.getConfigRoot().get(CONFIG_SHOW_WELCOME_MESSAGE)) {
      return [];
    }

    if (element === undefined) {
      const chroot = this.chrootService.chroot();
      if (chroot === undefined) {
        return [];
      }
      return (await cros.getSetupBoardsAlphabetic(chroot))
        .map(x => new Board(x))
        .concat([new Board(VIRTUAL_BOARDS_HOST)]);
    }
    if (element && element instanceof Board) {
      return (await getWorkedOnPackages(this.chrootService, element.name)).map(
        x => new Package(element, x)
      );
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

class ChrootItem extends vscode.TreeItem {}

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
async function getWorkedOnPackages(
  chrootService: ChrootService,
  board: string
): Promise<string[]> {
  const res = await chrootService.exec(
    'cros_workon',
    [board === VIRTUAL_BOARDS_HOST ? '--host' : `--board=${board}`, 'list'],
    ideUtil.getUiLogger().append,
    {logStdout: true}
  );
  if (res instanceof Error) {
    throw res;
  }
  return res.stdout.split('\n').filter(x => x.trim() !== '');
}

export const TEST_ONLY = {
  Board,
  Package,
  BoardPackageProvider,
  crosWorkonStart,
  crosWorkonStop,
};
