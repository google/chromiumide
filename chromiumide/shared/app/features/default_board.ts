// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../../../shared/app/common/vscode/commands';
import {
  BoardOrHost,
  parseBoardOrHost,
} from '../common/chromiumos/board_or_host';
import {getSetupBoardsRecentFirst} from '../common/chromiumos/boards';
import * as commonUtil from '../common/common_util';
import {getDriver} from '../common/driver_repository';
import {WrapFs} from '../common/wrap_fs';
import * as config from '../services/config';

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

export class NoBoardError extends Error {
  constructor() {
    super(
      'No board has been setup; run setup_board for the board you want to use, ' +
        'and revisit the editor'
    );
  }
}

/**
 * Get the default board, or ask the user to select one.
 *
 * @returns The default board name. null if the user ignores popup. NoBoardError if there is no
 *   available board.
 */
export async function getOrSelectDefaultBoard(
  chroot: WrapFs
): Promise<BoardOrHost | null | NoBoardError> {
  const board = config.board.get();
  if (board) {
    return parseBoardOrHost(board);
  }
  return await selectAndUpdateDefaultBoard(chroot, {suggestMostRecent: true});
}

/**
 * Ask user to select the board to use. If user selects a board, the config
 * is updated with the board name.
 *
 * @params options If options.suggestMostRecent is true, the board most recently
 * used is proposed to the user, before showing the board picker.
 */
export async function selectAndUpdateDefaultBoard(
  chroot: WrapFs,
  options: {
    suggestMostRecent: boolean;
  }
): Promise<BoardOrHost | null | NoBoardError> {
  const boards = await getSetupBoardsRecentFirst(
    chroot,
    new WrapFs(commonUtil.crosOutDir(commonUtil.crosRoot(chroot.root)))
  );
  const board = await selectBoard(boards, options.suggestMostRecent);

  if (board instanceof Error) {
    return board;
  }
  if (board) {
    // TODO(oka): This should be per chroot (i.e. Remote) setting, instead of global (i.e. User).
    await config.board.update(board.toString());
  }
  return board;
}

export async function selectBoard(
  boards: string[],
  suggestMostRecent: boolean
): Promise<BoardOrHost | null | NoBoardError> {
  if (boards.length === 0) {
    return new NoBoardError();
  }
  if (suggestMostRecent) {
    const mostRecent = boards[0];
    const selection = await commonUtil.withTimeout(
      vscode.window.showWarningMessage(
        `Default board is not set. Do you want to use ${mostRecent}?`,
        {
          title: 'Yes',
        },
        {
          title: 'Customize',
        }
      ),
      30 * 1000
    );
    if (!selection) {
      return null;
    }
    switch (selection.title) {
      case 'Yes':
        return parseBoardOrHost(mostRecent);
      case 'Customize':
        break;
      default:
        return null;
    }
  }

  const choice = await vscode.window.showQuickPick(boards, {
    title: 'Default board',
  });

  return typeof choice === 'string' ? parseBoardOrHost(choice) : null;
}
