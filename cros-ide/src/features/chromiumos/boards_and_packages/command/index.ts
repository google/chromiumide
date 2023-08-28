// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Context} from '../context';
import {Breadcrumbs} from '../item';
import {openEbuild} from './open_ebuild';
import {setDefaultBoard} from './set_default_board';

/**
 * Register all the commands for the boards and packages view and returns a disposable to unregister
 * them.
 */
export function registerCommands(ctx: Context): vscode.Disposable {
  return vscode.Disposable.from(
    // Commands for board items
    vscode.commands.registerCommand(
      'chromiumide.setDefaultBoard',
      ({breadcrumbs: [board]}: Breadcrumbs) => setDefaultBoard(board)
    ),
    // Commands for package name items
    vscode.commands.registerCommand(
      'chromiumide.openEbuild',
      ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
        openEbuild(ctx, board, {category, name})
    )
  );
}
