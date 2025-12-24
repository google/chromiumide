// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {parseBoardOrHost} from '../../../../../shared/app/common/chromiumos/board_or_host';
import {vscodeRegisterCommand} from '../../../../../shared/app/common/vscode/commands';
import * as config from '../../../../../shared/app/services/config';
import {Context} from '../context';
import {Breadcrumbs} from '../item';
import {build, buildWithFlags} from './build';
import {buildImage} from './build_image';
import {buildPackages} from './build_packages';
import {crosWorkon} from './cros_workon';
import {
  addFavoriteCategory,
  addFavoritePackage,
  deleteFavoriteCategory,
  deleteFavoritePackage,
} from './favorite';
import {openEbuild} from './open_ebuild';

export enum CommandName {
  BUILD_IMAGE = 'chromiumide.boardsAndPackages.buildImage',
  BUILD_PACKAGES = 'chromiumide.boardsAndPackages.buildPackages',
  SET_DEFAULT_BOARD = 'chromiumide.boardsAndPackages.setDefaultBoard',

  FAVORITE_ADD = 'chromiumide.boardsAndPackages.favoriteAdd',
  FAVORITE_DELETE = 'chromiumide.boardsAndPackages.favoriteDelete',

  CROS_WORKON_START = 'chromiumide.boardsAndPackages.crosWorkonStart',
  CROS_WORKON_STOP = 'chromiumide.boardsAndPackages.crosWorkonStop',
  OPEN_EBUILD = 'chromiumide.boardsAndPackages.openEbuild',
  BUILD = 'chromiumide.boardsAndPackages.build',
  BUILD_WITH_FLAGS = 'chromiumide.boardsAndPackages.buildWithFlags',
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
        CommandName.BUILD_IMAGE,
        async ({breadcrumbs: [board]}: Breadcrumbs) => {
          await buildImage(board);
        }
      ),
      this.register(
        CommandName.BUILD_PACKAGES,
        async ({breadcrumbs: [board]}: Breadcrumbs) => {
          await buildPackages(board);
        }
      ),
      this.register(
        CommandName.SET_DEFAULT_BOARD,
        async ({breadcrumbs: [board]}: Breadcrumbs) => {
          await config.board.update(board);
        }
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
          build(ctx, parseBoardOrHost(board), {category, name})
      ),
      this.register(
        CommandName.BUILD_WITH_FLAGS,
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          buildWithFlags(ctx, parseBoardOrHost(board), {category, name})
      ),
      this.register(
        CommandName.CROS_WORKON_START,
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          crosWorkon(ctx, parseBoardOrHost(board), {category, name}, 'start')
      ),
      this.register(
        CommandName.CROS_WORKON_STOP,
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          crosWorkon(ctx, parseBoardOrHost(board), {category, name}, 'stop')
      ),
      this.register(
        CommandName.OPEN_EBUILD,
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          openEbuild(ctx, parseBoardOrHost(board), {category, name})
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
