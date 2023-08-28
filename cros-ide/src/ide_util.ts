// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Keep all general utility functions here, or in common_util.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {BoardOrHost} from './common/chromiumos/board_or_host';
import * as commonUtil from './common/common_util';
import {Chroot} from './common/common_util';
import * as cros from './common/cros';
import * as config from './services/config';

const loggerInstance = vscode.window.createOutputChannel(
  'ChromiumIDE: UI Actions'
);

/**
 * Return the logger that should be used by actions done in UI. For example,
 * navigating to CodeSearch, opening listing packages worked on (view), and so on.
 *
 * Tasks that run in background or produce lots of logs should create their own loggers.
 * See cros lint and C++ code completion for examples.
 */
// TODO(ttylenda): Move this function to a separate file in ui/.
export function getUiLogger(): vscode.OutputChannel {
  return loggerInstance;
}

export const SHOW_UI_LOG: vscode.Command = {
  command: 'chromiumide.showUiLog',
  title: '',
};

/**
 * Get the target board, or ask the user to select one.
 *
 * @returns The targe board name. null if the user ignores popup. NoBoardError if there is no
 *   available board.
 */
export async function getOrSelectTargetBoard(
  chroot: cros.WrapFs<Chroot>
): Promise<BoardOrHost | null | NoBoardError> {
  const board = config.board.get();
  if (board) {
    return BoardOrHost.parse(board);
  }
  return await selectAndUpdateTargetBoard(chroot, {suggestMostRecent: true});
}

export class NoBoardError extends Error {
  constructor() {
    super(
      'no board has been setup; run setup_board for the board you want to use, ' +
        'and revisit the editor'
    );
  }
}

/**
 * Ask user to select the board to use. If user selects a board, the config
 * is updated with the board name.
 *
 * @params options If options.suggestMostRecent is true, the board most recently
 * used is proposed to the user, before showing the board picker.
 */
export async function selectAndUpdateTargetBoard(
  chroot: cros.WrapFs<Chroot>,
  options: {
    suggestMostRecent: boolean;
  }
): Promise<BoardOrHost | null | NoBoardError> {
  const boards = await cros.getSetupBoardsRecentFirst(
    chroot,
    new cros.WrapFs(commonUtil.crosOutDir(commonUtil.sourceDir(chroot.root)))
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

async function selectBoard(
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
        `Target board is not set. Do you use ${mostRecent}?`,
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
        return BoardOrHost.parse(mostRecent);
      case 'Customize':
        break;
      default:
        return null;
    }
  }

  const choice = await vscode.window.showQuickPick(boards, {
    title: 'Target board',
  });

  return typeof choice === 'string' ? BoardOrHost.parse(choice) : null;
}

/**
 * Returns VSCode executable given appRoot and the name of the executable under bin directory.
 * Returns Error if executable is not found.
 */
function findExecutable(appRoot: string, name: string): string | Error {
  let dir = appRoot;
  while (dir !== '/') {
    const exe = path.join(dir, 'bin', name);
    if (fs.existsSync(exe)) {
      return exe;
    }
    dir = path.dirname(dir);
  }
  return new Error(`${name} was not found for ${appRoot}`);
}

/**
 * Returns VSCode executable path, or error in case it's not found.
 */
export function vscodeExecutablePath(
  appRoot = vscode.env.appRoot,
  appName = vscode.env.appName,
  remoteName = vscode.env.remoteName
): string | Error {
  let executableName;
  // code-server's appName differs depending on the version.
  if (appName === 'code-server' || appName === 'Code - OSS') {
    executableName = 'code-server';
  } else if (appName === 'Visual Studio Code') {
    executableName = 'code';
  } else if (appName === 'Visual Studio Code - Insiders') {
    executableName = 'code-insiders';
  } else {
    return new Error(`vscode app name not recognized: ${appName}`);
  }
  const executableSubPath =
    remoteName === 'ssh-remote'
      ? path.join('remote-cli', executableName)
      : executableName;

  return findExecutable(appRoot, executableSubPath);
}

export function isCodeServer(appHost = vscode.env.appHost): boolean {
  // vscode.env.appHost stores the hosted location of the application.
  // On desktop this is 'desktop'. In the web it is the specified embedder.
  // See https://code.visualstudio.com/api/references/vscode-api#env
  // TODO(b/232050207): Check if the IDE is run on code-server or on the
  //   desktop app more reliably.
  return appHost !== 'desktop';
}
