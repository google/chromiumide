// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Keep all general utility functions here, or in common_util.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from './common/common_util';
import * as cros from './common/cros';

export function getConfigRoot(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('cros-ide');
}

export function createTerminalForHost(
    host: string, namePrefix: string, context: vscode.ExtensionContext,
    extraOptions?: string): vscode.Terminal {
  const terminal = vscode.window.createTerminal(`${namePrefix} ${host}`);

  terminal.sendText(
      // eslint-disable-next-line max-len
      'ssh '.concat(sshFormatArgs(host, `; exit $?`, getTestingRsaPath(context), extraOptions).join(' ')),
  );
  return terminal;
}

const loggerInstance = vscode.window.createOutputChannel('CrOS IDE: UI Actions');

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
  command: 'cros-ide.showUiLog',
  title: '',
};

export function getTestingRsaPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.
      joinPath(context.extensionUri, 'resources', 'testing_rsa').fsPath;
}

/**
 *
 * @param host hostname, which can be in the format of 'hostname' or 'hostname:port'
 * @param cmd CLI command to execute
 * @param testingRsaPath absolute path to the testingRSA key
 * @param extraOptions additional CLI options for your command
 * @returns formatted SSH command
 */
export function sshFormatArgs(host: string, cmd: string, testingRsaPath: string,
    extraOptions ?: string): string[] {
  let port = '22';
  const [hostname, portname] = host.split(':');
  if (portname != null) {
    host = hostname;
    port = portname;
  }

  let args = ['-i', testingRsaPath];
  // eslint-disable-next-line max-len
  const trailingArgs = ['-o StrictHostKeyChecking=no', '-o UserKnownHostsFile=/dev/null', '-p', port, `root@${host}`, cmd];
  if (extraOptions != null) {
    args.push(extraOptions);
  }
  args = args.concat(trailingArgs);
  return args;
}

// Config section name for the target board.
export const BOARD = 'board';

/**
 * Get the target board, or ask the user to select one.
 *
 * @returns The targe board name. null if the user ignores popup. NoBoardError if there is no
 *   available board.
 */
export async function getOrSelectTargetBoard(): Promise<string | null | NoBoardError> {
  const board = getConfigRoot().get<string>(BOARD);
  if (board) {
    return board;
  }
  return await selectAndUpdateTargetBoard({suggestMostRecent: true});
}

export class NoBoardError extends Error {
  constructor() {
    super('no board has been setup; run setup_board for the board you want to use, ' +
      'and revisit the editor');
  }
}

/**
 * Ask user to select the board to use. If user selects a board, the config
 * is updated with the board name.
 *
 * @params config If config.suggestMostRecent is true, the board most recently
 * used is proposed to the user, before showing the board picker.
 *
 * TODO(oka): unit test this function (consider stubbing vscode APIs).
 */
export async function selectAndUpdateTargetBoard(
    config: {suggestMostRecent: boolean}): Promise<string | null | NoBoardError> {
  const boards = await cros.getSetupBoardsRecentFirst();
  const board = await selectBoard(boards, config.suggestMostRecent);

  if (board) {
    // TODO(oka): This should be per chroot (i.e. Remote) setting, instead of global (i.e. User).
    await getConfigRoot().update(BOARD, board, vscode.ConfigurationTarget.Global);
  }
  return board;
}

async function selectBoard(
    boards: string[], suggestMostRecent: boolean):Promise<string | null | NoBoardError> {
  if (boards.length === 0) {
    return new NoBoardError();
  }
  if (suggestMostRecent) {
    const mostRecent = boards[0];
    const selection = await commonUtil.withTimeout(vscode.window.showWarningMessage(
        `Target board is not set. Do you use ${mostRecent}?`, {
          title: 'Yes',
        }, {
          title: 'Customize',
        }), 30 * 1000);
    if (!selection) {
      return null;
    }
    switch (selection.title) {
      case 'Yes':
        return mostRecent;
      case 'Customize':
        break;
      default:
        return null;
    }
  }
  return await vscode.window.showQuickPick(boards, {
    title: 'Target board',
  }) || null;
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
    appRoot = vscode.env.appRoot, appName = vscode.env.appName): string | Error {
  if (appName === 'code-server') {
    return findExecutable(appRoot, 'code-server');
  } else if (appName === 'Visual Studio Code') {
    return findExecutable(appRoot, 'remote-cli/code');
  } else if (appName === 'Visual Studio Code - Insiders') {
    return findExecutable(appRoot, 'remote-cli/code-insiders');
  }
  return new Error(`vscode app name not recognized: ${appName}`);
}
