// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as cros from '../../common/cros';
import * as ideUtil from '../../ide_util';
import * as services from '../../services';
import * as config from '../../services/config';
import * as metrics from '../metrics/metrics';

export async function activate(
  subscriptions: vscode.Disposable[],
  chrootService: services.chromiumos.ChrootService
): Promise<void> {
  const boardPackageProvider = new BoardPackageProvider(chrootService);
  const boardsPackages = new BoardsPackages(chrootService);

  subscriptions.push(
    vscode.commands.registerCommand('chromiumide.crosWorkonStart', board =>
      boardsPackages.crosWorkonStart(board)
    ),
    vscode.commands.registerCommand('chromiumide.crosWorkonStop', board =>
      boardsPackages.crosWorkonStop(board)
    ),
    vscode.commands.registerCommand('chromiumide.openEbuild', board =>
      boardsPackages.openEbuild(board)
    ),

    vscode.commands.registerCommand('chromiumide.refreshBoardsPackages', () =>
      boardPackageProvider.refresh()
    ),

    vscode.commands.registerCommand(
      'chromiumide.setDefaultBoard',
      (board: Board) => {
        if (board) {
          void config.board.update(board.name);
        }
      }
    ),

    vscode.commands.registerCommand(
      'chromiumide.dismissBoardsPkgsWelcome',
      async () => {
        await config.boardsAndPackages.showWelcomeMessage.update(false);
        boardPackageProvider.refresh();
      }
    ),

    vscode.window.registerTreeDataProvider(
      'legacy-boards-packages',
      boardPackageProvider
    )
  );

  subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(
      (e: vscode.ConfigurationChangeEvent) => {
        if (e.affectsConfiguration('chromiumide.board')) {
          boardPackageProvider.refresh();
        }
      }
    )
  );

  await boardsPackages.createPackageWatches();
}

const VIRTUAL_BOARDS_HOST = 'host';

class BoardsPackages {
  constructor(
    private readonly chrootService: services.chromiumos.ChrootService
  ) {}

  // TODO: Write a unit test for watching packages.
  async createPackageWatches(): Promise<void> {
    const chroot = this.chrootService.chroot;
    const out = this.chrootService.out;

    const boards = await cros.getSetupBoardsAlphabetic(chroot, out);
    const crosWorkonDir = '.config/cros_workon/';

    const source = this.chrootService.source;

    // Watching for non-existent directory throws errors,
    // which happens when we run tests outside chroot.
    if (!source.existsSync(crosWorkonDir)) {
      return;
    }

    source.watchSync(crosWorkonDir, (_eventType, fileName) => {
      // Multiple files can be changed. This restrictions limits the number of refreshes to one.
      if (
        (fileName && boards.includes(fileName)) ||
        fileName === VIRTUAL_BOARDS_HOST
      ) {
        void vscode.commands.executeCommand(
          'chromiumide.refreshBoardsPackages'
        );
      }
    });
  }

  async crosWorkonStart(board: BoardItem): Promise<void> {
    const pkgName = await vscode.window.showInputBox({
      title: 'Package',
      placeHolder: 'package, e.g. chromeos-base/shill',
    });

    if (!pkgName) {
      return;
    }

    metrics.send({
      category: 'interactive',
      group: 'package',
      description: 'cros_workon start',
      name: 'package_cros_workon_start',
      package: pkgName,
      board: board.name,
    });
    await this.crosWorkon(board.name, 'start', pkgName);
  }

  async crosWorkonStop(pkg: PackageItem): Promise<void> {
    metrics.send({
      category: 'interactive',
      group: 'package',
      description: 'cros_workon stop',
      name: 'package_cros_workon_stop',
      package: pkg.name,
      board: pkg.board.name,
    });
    await this.crosWorkon(pkg.board.name, 'stop', pkg.name);
  }

  async crosWorkon(
    boardName: string,
    cmd: string,
    pkgName: string
  ): Promise<void> {
    const res = await this.chrootService.exec(
      'cros_workon',
      [
        boardName === VIRTUAL_BOARDS_HOST ? '--host' : `--board=${boardName}`,
        cmd,
        pkgName,
      ],
      {
        logger: ideUtil.getUiLogger(),
        logStdout: true,
        ignoreNonZeroExit: true,
        sudoReason: 'to run cros_workon in chroot',
      }
    );
    if (res instanceof Error) {
      void vscode.window.showErrorMessage(res.message);
      return;
    }
    const {exitStatus, stderr} = res;
    if (exitStatus !== 0) {
      void vscode.window.showErrorMessage(`cros_workon failed: ${stderr}`);
    }
  }

  async openEbuild(pkg: PackageItem): Promise<void> {
    const res = await this.chrootService.exec(
      pkg.board.name === VIRTUAL_BOARDS_HOST
        ? 'equery'
        : `equery-${pkg.board.name}`,
      ['which', '-m', pkg.name],
      {
        logger: ideUtil.getUiLogger(),
        logStdout: true,
        sudoReason: 'to query ebuild path',
      }
    );
    if (res instanceof Error) {
      void vscode.window.showErrorMessage(res.message);
      return;
    }
    const relFileName = res.stdout.trim().substring('/mnt/host/source/'.length);
    const srcRoot = this.chrootService.source;
    const fileName = srcRoot.realpath(relFileName);
    const document = await vscode.workspace.openTextDocument(fileName);
    await vscode.window.showTextDocument(document);
    metrics.send({
      category: 'interactive',
      group: 'package',
      name: 'package_open_ebuild',
      description: 'open ebuild',
    });
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

  constructor(
    private readonly chrootService: services.chromiumos.ChrootService
  ) {}

  async getChildren(element?: ChrootItem): Promise<ChrootItem[]> {
    // Welcome messages are shown when there are no elements, so return an empty result
    // even if there are boards in the chroot message is dismissed.
    if (config.boardsAndPackages.showWelcomeMessage.get()) {
      return [];
    }

    const defaultBoard = config.board.get();

    if (element === undefined) {
      return (
        await cros.getSetupBoardsAlphabetic(
          this.chrootService.chroot,
          this.chrootService.out
        )
      )
        .map(boardName => new BoardItem(boardName, boardName === defaultBoard))
        .concat([new BoardItem(VIRTUAL_BOARDS_HOST)]);
    }
    if (element && element instanceof BoardItem) {
      return (
        await this.getWorkedOnPackages(this.chrootService, element.name)
      ).map(x => new PackageItem(element, x));
    }
    return [];
  }

  getTreeItem(element: ChrootItem): vscode.TreeItem {
    return element;
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  /**
   * @returns Packages that are worked on.
   */
  async getWorkedOnPackages(
    chrootService: services.chromiumos.ChrootService,
    board: string
  ): Promise<string[]> {
    const res = await chrootService.exec(
      'cros_workon',
      [board === VIRTUAL_BOARDS_HOST ? '--host' : `--board=${board}`, 'list'],
      {
        logger: ideUtil.getUiLogger(),
        logStdout: true,
        sudoReason: 'to get worked on packages in chroot',
      }
    );
    if (res instanceof Error) {
      throw res;
    }
    return res.stdout.split('\n').filter(x => x.trim() !== '');
  }
}

/** Board in "Boards and Packages" view. */
export interface Board {
  name: string;
}

/** Package in "Boards and Packages" view. */
export interface Package {
  board: Board;
  name: string;
}

class ChrootItem extends vscode.TreeItem {}

// TODO(ttylenda): extract classes for actual boards and host.
class BoardItem extends ChrootItem implements Board {
  constructor(readonly name: string, readonly isDefault = false) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
    // - All boards need '+' item to start working on a package.
    // - Host and default board should not show 'Set as Default Board' item
    //   in the context menu.
    const contextModifiers: string[] = [];

    if (name === VIRTUAL_BOARDS_HOST) {
      this.iconPath = new vscode.ThemeIcon('device-desktop');
      contextModifiers.push('host');
    } else {
      this.iconPath = new vscode.ThemeIcon('circuit-board');
    }

    if (isDefault) {
      this.description = 'default';
      contextModifiers.push('default');
    }

    // Three values are possible:
    // 1) 'board-default' for at most one hardware board if it is selected
    //    via chromiumide.board setting
    // 2) 'board' for hardware boards that are not selected
    // 3) 'board-host' for one virtual board for host packages
    //
    // TODO(b:236187246): ensure that 'board-host-default' is not possible,
    // see: https://chromium-review.googlesource.com/c/chromiumos/chromite/+/4116316/comment/94832cd9_8ff443a5/
    this.contextValue = ['board', ...contextModifiers].join('-');
  }
}

class PackageItem extends ChrootItem implements Package {
  constructor(readonly board: BoardItem, readonly name: string) {
    super(name, vscode.TreeItemCollapsibleState.None);
  }

  override readonly contextValue = 'package';
  override readonly iconPath = new vscode.ThemeIcon('package');
}

export const TEST_ONLY = {
  BoardItem,
  PackageItem,
  BoardPackageProvider,
  BoardsPackages,
};
