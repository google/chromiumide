// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Context} from '../context';
import {Breadcrumbs} from '../item';
import {crosWorkon} from './cros_workon';
import {openEbuild} from './open_ebuild';
import {setDefaultBoard} from './set_default_board';

export enum CommandName {
  SET_DEFAULT_BOARD = 'chromiumide.setDefaultBoard',
  CROS_WORKON_START = 'chromiumide.crosWorkonStart',
  CROS_WORKON_STOP = 'chromiumide.crosWorkonStop',
  OPEN_EBUILD = 'chromiumide.openEbuild',
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
      // Commands for package name items
      this.register(
        CommandName.OPEN_EBUILD,
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          openEbuild(ctx, board, {category, name})
      ),
      this.register(
        CommandName.CROS_WORKON_START,
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          crosWorkon(ctx, board, {category, name}, 'start')
      ),
      this.register(
        CommandName.CROS_WORKON_STOP,
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          crosWorkon(ctx, board, {category, name}, 'stop')
      )
    );
  }

  private register(
    command: CommandName,
    callback: (args: Breadcrumbs) => Thenable<void>
  ): vscode.Disposable {
    return vscode.commands.registerCommand(command, async args => {
      await callback(args);
      this.onDidExecuteCommandEmitter.fire(command);
    });
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }
}
