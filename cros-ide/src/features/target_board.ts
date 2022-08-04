// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Manages the target board config.
 */

import * as vscode from 'vscode';
import * as ideUtil from '../ide_util';
import {ChrootService} from '../services/chroot';
import * as config from '../services/config';
import * as metrics from './metrics/metrics';

const BOARD_CONFIG = 'cros-ide.board';

export function activate(
  context: vscode.ExtensionContext,
  chrootService: ChrootService
) {
  const boardStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  boardStatusBarItem.command = 'cros-ide.selectBoard';

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(
      (e: vscode.ConfigurationChangeEvent) => {
        if (e.affectsConfiguration(BOARD_CONFIG)) {
          updateBoardStatus(boardStatusBarItem);
        }
      }
    )
  );
  updateBoardStatus(boardStatusBarItem);

  vscode.commands.registerCommand('cros-ide.selectBoard', async () => {
    const chroot = chrootService.chroot();
    if (chroot === undefined) {
      return;
    }
    const board = await ideUtil.selectAndUpdateTargetBoard(chroot, {
      suggestMostRecent: false,
    });
    if (board instanceof ideUtil.NoBoardError) {
      await vscode.window.showErrorMessage(`Selecting board: ${board.message}`);
      return;
    }
    // Type-check that errors are handled.
    ((_: string | null) => {})(board);
    if (board) {
      metrics.send({
        category: 'interactive',
        group: 'misc',
        action: 'select target board',
        label: board,
      });
    }
  });
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
