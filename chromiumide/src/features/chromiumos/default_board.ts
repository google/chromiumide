// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Manages the default board config.
 */

import * as vscode from 'vscode';
import {BoardOrHost} from '../../../shared/app/common/chromiumos/board_or_host';
import {getDriver} from '../../../shared/app/common/driver_repository';
import {vscodeRegisterCommand} from '../../../shared/app/common/vscode/commands';
import {WrapFs} from '../../../shared/app/common/wrap_fs';
import {
  selectAndUpdateDefaultBoard,
  NoBoardError,
} from '../../../shared/app/features/default_board';
import * as config from '../../../shared/app/services/config';

const driver = getDriver();

export function activate(
  context: vscode.ExtensionContext,
  chroot: WrapFs
): void {
  const boardStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  boardStatusBarItem.command = 'chromiumide.selectBoard';

  context.subscriptions.push(
    config.board.onDidChange(() => {
      updateBoardStatus(boardStatusBarItem);
    })
  );
  updateBoardStatus(boardStatusBarItem);

  context.subscriptions.push(
    vscodeRegisterCommand('chromiumide.selectBoard', async () => {
      const board = await selectAndUpdateDefaultBoard(chroot, {
        suggestMostRecent: false,
      });
      if (board instanceof NoBoardError) {
        await vscode.window.showErrorMessage(
          `Selecting board: ${board.message}`
        );
        return;
      }
      // Type-check that errors are handled.
      ((_: BoardOrHost | null) => {})(board);
      if (board) {
        driver.metrics.send({
          category: 'interactive',
          group: 'misc',
          name: 'select_target_board',
          description: 'select default board',
          board: board.toString(),
        });
      }
    })
  );
}

function updateBoardStatus(boardStatusBarItem: vscode.StatusBarItem) {
  const board = config.board.get();
  boardStatusBarItem.text = board;
  if (board) {
    boardStatusBarItem.show();
  } else {
    boardStatusBarItem.hide();
  }
}
