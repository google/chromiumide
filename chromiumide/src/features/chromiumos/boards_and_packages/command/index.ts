// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {BoardOrHost} from '../../../../common/chromiumos/board_or_host';
import {vscodeRegisterCommand} from '../../../../common/vscode/commands';
import {Context} from '../context';
import {Breadcrumbs} from '../item';
import {build} from './build';
import {crosWorkon} from './cros_workon';
import {
  addFavoriteCategory,
  addFavoritePackage,
  deleteFavoriteCategory,
  deleteFavoritePackage,
} from './favorite';
import {openEbuild} from './open_ebuild';
import {setDefaultBoard} from './set_default_board';

export enum CommandName {
  SET_DEFAULT_BOARD = 'chromiumide.boardsAndPackages.setDefaultBoard',

  FAVORITE_ADD = 'chromiumide.boardsAndPackages.favoriteAdd',
  FAVORITE_DELETE = 'chromiumide.boardsAndPackages.favoriteDelete',

  CROS_WORKON_START = 'chromiumide.boardsAndPackages.crosWorkonStart',
  CROS_WORKON_STOP = 'chromiumide.boardsAndPackages.crosWorkonStop',
  OPEN_EBUILD = 'chromiumide.boardsAndPackages.openEbuild',
  BUILD = 'chromiumide.boardsAndPackages.build',
}

/**
 * Register all the commands for the boards and packages view on instantiation and  unregister them
 * on dispose.
 */
export class BoardsAndPackagesCommands implements vscode.Disposable {
  private readonly onDidExecuteCommandEmitter =
    new vscode.EventEmitter<CommandName>();
  /** Emits the command name after the callback of the command is fulfilled. */
  readonly onDidExecuteCommand = this.onDidExecuteCommandEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidExecuteCommandEmitter,
  ];

  constructor(ctx: Context) {
    this.subscriptions.push(
      // Commands for board items
      this.register(
        CommandName.SET_DEFAULT_BOARD,
        ({breadcrumbs: [board]}: Breadcrumbs) => setDefaultBoard(board)
      ),
      // Commands for category name and package name items
      this.register(
        CommandName.FAVORITE_ADD,
        async ({breadcrumbs: [_board, category, name]}: Breadcrumbs) => {
          if (name) {
            await addFavoritePackage({category, name});
          } else {
            await addFavoriteCategory(category);
          }
        }
      ),
      this.register(
        CommandName.FAVORITE_DELETE,
        async ({breadcrumbs: [_board, category, name]}: Breadcrumbs) => {
          if (name) {
            await deleteFavoritePackage({category, name});
          } else {
            await deleteFavoriteCategory(category);
          }
        }
      ),
      // Commands for package name items
      this.register(
        CommandName.BUILD,
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          build(ctx, BoardOrHost.parse(board), {category, name})
      ),
      this.register(
        CommandName.CROS_WORKON_START,
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          crosWorkon(ctx, BoardOrHost.parse(board), {category, name}, 'start')
      ),
      this.register(
        CommandName.CROS_WORKON_STOP,
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          crosWorkon(ctx, BoardOrHost.parse(board), {category, name}, 'stop')
      ),
      this.register(
        CommandName.OPEN_EBUILD,
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          openEbuild(ctx, BoardOrHost.parse(board), {category, name})
      )
    );
  }

  private register(
    command: CommandName,
    callback: (args: Breadcrumbs) => Thenable<void>
  ): vscode.Disposable {
    return vscodeRegisterCommand(command, async (args: Breadcrumbs) => {
      await callback(args);
      this.onDidExecuteCommandEmitter.fire(command);
    });
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }
}
