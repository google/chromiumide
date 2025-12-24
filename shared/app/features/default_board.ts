// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../../../shared/app/common/vscode/commands';
import {Platform} from '../../driver';
import {
  BoardOrHost,
  parseBoardOrHost,
} from '../common/chromiumos/board_or_host';
import {
  getSetupBoardsRecentFirst,
  getAllChromeosBoards,
  NoBoardError,
} from '../common/chromiumos/boards';
import {crosOutDir, crosRoot, withTimeout} from '../common/common_util';
import {getDriver} from '../common/driver_repository';
import {WrapFs} from '../common/wrap_fs';
import * as config from '../services/config';

const driver = getDriver();

export function activate(
  context: vscode.ExtensionContext,
  chroot: string
): void {
  const boardStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  boardStatusBarItem.tooltip = 'Click to update default board';
  boardStatusBarItem.command = 'chromiumide.selectBoard';
  updateBoardStatus(boardStatusBarItem, config.board.get());
  boardStatusBarItem.show();

  context.subscriptions.push(
    config.board.onDidChange(board => {
      updateBoardStatus(boardStatusBarItem, board);
    })
  );

  context.subscriptions.push(
    vscodeRegisterCommand('chromiumide.selectBoard', async () => {
      const boards = await getBoards(chroot);
      if (boards instanceof Error) {
        await vscode.window.showErrorMessage(
          `Selecting board: failed to get boards: ${boards.message}`
        );
        return;
      }
      const board = await selectAndUpdateDefaultBoard(boards);
      if (board instanceof Error) {
        await vscode.window.showErrorMessage(
          `Selecting board: ${board.message}`
        );
        return;
      }
      // Type-check that errors are handled.
      ((_: BoardOrHost | undefined) => {})(board);
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

function updateBoardStatus(
  boardStatusBarItem: vscode.StatusBarItem,
  board: string
) {
  if (board) {
    boardStatusBarItem.text = board;
    boardStatusBarItem.backgroundColor = undefined; // use default
  } else {
    boardStatusBarItem.text = '(No default board)';
    boardStatusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground'
    );
  }
}

/**
 * Get the default board, or ask the user to select one.
 *
 * @param platform The platform the extension is running on. Only for testing. Do not set (always
 * use the default in extension code that calls driver.platform())
 *
 * @returns The default board name. undefined if the user ignores popup or quick pick. NoBoardError
 * if there is no available board. Error for other kind of errors (e.g. `cros query boards` command
 * failed).
 */
export async function getOrPromptToSelectDefaultBoard(
  chroot: string,
  platform = driver.platform()
): Promise<BoardOrHost | undefined | NoBoardError | Error> {
  // Default board has been set, return directly.
  const board = config.board.get();
  if (board) {
    return parseBoardOrHost(board);
  }

  const boards = await getBoards(chroot, platform);
  if (boards instanceof Error) {
    return boards;
  }
  // On cider where `cros query boards` is used to get the list of all board, the getBoards function
  // will return NoBoardError (and this function returns it in above condition) if the list is
  // empty. Therefore, this only happens on vscode where it lists only boards that have been set up
  // and having no board is a legitimate use case.
  if (boards.length === 0) {
    return new NoBoardError(
      'no board has been setup; run setup_board for the board you want to use, ' +
        'and revisit the editor'
    );
  }

  const mostRecent = boards[0];
  const optionYes = 'Yes';
  const optionSelectFromList = 'Select from list';
  const options =
    platform === Platform.VSCODE
      ? [optionYes, optionSelectFromList]
      : [optionSelectFromList];
  const prompt =
    platform === Platform.VSCODE
      ? `Default board is not set. Do you want to use ${mostRecent}?`
      : 'Default board is not set.';
  const selection = await withTimeout(
    vscode.window.showWarningMessage(prompt, ...options),
    30 * 1000
  );
  switch (selection) {
    case optionYes:
      await config.board.update(mostRecent);
      return parseBoardOrHost(mostRecent);
    case optionSelectFromList:
      return await selectAndUpdateDefaultBoard(boards);
    default:
      return undefined;
  }
}

/**
 * Show quick pick for user to select the default board from the given list. If user selects a
 * board, the config will be updated with the board name and return the board.
 */
async function selectAndUpdateDefaultBoard(
  boards: string[]
): Promise<BoardOrHost | undefined> {
  const board = await vscode.window.showQuickPick(boards, {
    title: 'Default board',
  });
  if (board === undefined) {
    return board;
  }

  // TODO(oka): This should be per chroot (i.e. Remote) setting, instead of global (i.e. User).
  await config.board.update(board);
  return parseBoardOrHost(board);
}

async function getBoards(
  chroot: string,
  platform = driver.platform()
): Promise<string[] | NoBoardError | Error> {
  const chromiumosRoot = crosRoot(chroot);
  return platform === Platform.VSCODE
    ? await getSetupBoardsRecentFirst(
        new WrapFs(chroot),
        new WrapFs(crosOutDir(chromiumosRoot))
      )
    : await getAllChromeosBoards(chromiumosRoot);
}
