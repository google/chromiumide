// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Manages the target board config.
 */

import * as vscode from 'vscode';
import {BoardOrHost} from '../../common/chromiumos/board_or_host';
import {vscodeRegisterCommand} from '../../common/vscode/commands';
import * as ideUtil from '../../ide_util';
import * as services from '../../services';
import * as config from '../../services/config';
import {Metrics} from '../metrics/metrics';

export function activate(
  context: vscode.ExtensionContext,
  chrootService: services.chromiumos.ChrootService
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
      const board = await ideUtil.selectAndUpdateTargetBoard(
        chrootService.chroot,
        {
          suggestMostRecent: false,
        }
      );
      if (board instanceof ideUtil.NoBoardError) {
        await vscode.window.showErrorMessage(
          `Selecting board: ${board.message}`
        );
        return;
      }
      // Type-check that errors are handled.
      ((_: BoardOrHost | null) => {})(board);
      if (board) {
        Metrics.send({
          category: 'interactive',
          group: 'misc',
          name: 'select_target_board',
          description: 'select target board',
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
