// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../../common/vscode/commands';
import * as config from '../../services/config';
import {StatusManager, TaskStatus} from '../../ui/bg_task_status';

// TODO:
// Progress for everything.

const autoninjaLineToProcess = (line: string) => {
  const regex = /\[([0-9]+)\/([0-9]+)\]/g;
  const match = regex.exec(line);
  if (match) {
    return {done: Number(match[1]), total: Number(match[2])};
  }
  return null;
};

// TODO(jopalmer): Convert to async rather than callback.
const deployToDut = (
  label: string,
  dir: string,
  isLacros: boolean,
  deviceName: string,
  board: string,
  statusManager: StatusManager,
  doneCallback: () => void
) => {
  // Check if in chrome directory
  if (fs.existsSync('chrome')) {
    console.error('file did not exist');
    return;
  }
  const taskName = isLacros ? 'Lacros deploy' : 'Ash deploy';
  statusManager.setTask(taskName, {
    status: TaskStatus.RUNNING,
    command: {
      command: 'chromiumide.chrome.build',
      title: taskName,
    },
  });
  // deploy chrome likes to log lots of stuff to stderr so disable it to
  // minimise bad logs showing
  const deployArgs = [
    `--build-dir=${dir}`,
    `--device=${deviceName}`,
    '--log-level',
    'error',
  ];
  if (isLacros) {
    deployArgs.push('--lacros');
    deployArgs.push('--nostrip');
  } else {
    deployArgs.push(`--board=${board}`);
  }
  let channel: vscode.OutputChannel | null = null;
  let stderr = '';
  // TODO(jopalmer): Convert to commonUtil.exec
  const deploy = cp.spawn(
    'third_party/chromite/bin/deploy_chrome',
    deployArgs,
    {
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.path || '',
    }
  );

  deploy.stderr.on('data', data => {
    const lines = data.toString('utf8');
    // Early break on SSH - warning is always printed.
    if (lines.includes('to the list of known hosts')) {
      return;
    }
    if (!channel) {
      channel = vscode.window.createOutputChannel(taskName);
    }
    stderr = stderr + lines + '/n';
    channel.append(stderr);
  });
  deploy.on('exit', () => {
    // TODO: check exit code
    statusManager.setTask(taskName, {
      status: TaskStatus.OK,
      command: {
        command: 'chromiumide.chrome.build',
        title: taskName,
      },
    });
    doneCallback();
  });
};

// TODO(jopalmer): Convert to async rather than callback.
const buildChromeDir = (
  dir: string,
  label: string,
  deviceName: string,
  board: string,
  statusManager: StatusManager,
  doneCallback: () => void = () => {}
) => {
  // Check if in chrome directory
  if (fs.existsSync('chrome')) {
    console.error('file did not exist');
    return;
  }
  const taskName = label === 'lacros' ? 'Lacros build' : 'Ash build';

  statusManager.setTask(taskName, {
    status: TaskStatus.RUNNING,
    command: {
      command: 'chromiumide.chrome.build',
      title: taskName,
    },
  });
  const env = {
    ...process.env,
    FORCE_COLOR: '1',
    CLICOLOR_FORCE: '1',
    TERM: 'xterm-256color',
  };

  // TODO(jopalmer): Convert to commonUtil.exec
  //
  // TODO(cmfcmf): De-duplicate this code with the code for building tests in
  // src/features/chromium/gtest/runner.ts and src/features/chromium/autoninja.ts. Also, this code
  // should likely re-use the output directory management.
  const autoninja = cp.spawn('autoninja', ['-C', dir, 'chrome'], {
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.path ?? '',
    shell: false,
    env,
  });
  let stderr = '';
  let channel: vscode.OutputChannel | null = null;
  autoninja.stdout.setEncoding('utf8');
  autoninja.stdout.on('data', data => {
    const lines = data.toString('utf8');
    for (const line of lines.split(/\r?\n/)) {
      if (line.startsWith('ninja:')) {
        continue;
      }
      const progress = autoninjaLineToProcess(line);
      // Autoninja doesn't use stderr so assume all non progress lines are
      // error
      if (!progress && line.trim() !== '') {
        stderr += line + '\n';
        if (!channel) {
          channel = vscode.window.createOutputChannel(taskName);
        }
        channel.append(stderr);
      }
      if (progress && progress.done % 100 === 0) {
        // TODO: progress?
      }
    }
  });
  autoninja.on('exit', code => {
    if (code === 0) {
      statusManager.setTask(taskName, {
        status: TaskStatus.OK,
        command: {
          command: 'chromiumide.chrome.build',
          title: taskName,
        },
      });
      deployToDut(
        label,
        dir,
        label === 'lacros',
        deviceName,
        board,
        statusManager,
        doneCallback
      );
    } else {
      statusManager.setTask(taskName, {
        status: TaskStatus.ERROR,
        command: {
          command: 'chromiumide.chrome.build',
          title: taskName,
        },
      });
      doneCallback();
    }
  });
};
/**  Provides several functions related to building Chromium.
 *
 * Currently guarded via underdevelopment.chromiumBuild flag.
 * Provides 2 functions:
 *  chromiumide.chrome.build: Builds + deploys Ash+Lacros to a DUT
 *  chromiumide.chrome.watchBuild: Builds + deploys Ash+Lacros to a DUT and re-runs on every save.
 *
 * Works when in a Chromium (rather than ChromeOS) checkout, requires appropriate out* directories
 * to be set up and relevant config values (board, DUT name, ash build directory)
 */
export function activate(
  context: vscode.ExtensionContext,
  statusManager: StatusManager
): void {
  statusManager.setTask('Ash build', {
    status: TaskStatus.OK,
    command: {
      command: 'chromiumide.chrome.build',
      title: 'Ash build',
    },
  });
  statusManager.setTask('Lacros build', {
    status: TaskStatus.OK,
    command: {
      command: 'chromiumide.chrome.build',
      title: 'Lacros build',
    },
  });

  statusManager.setTask('Ash deploy', {
    status: TaskStatus.OK,
    command: {
      command: 'chromiumide.chrome.build',
      title: 'Ash deploy',
    },
  });
  statusManager.setTask('Lacros deploy', {
    status: TaskStatus.OK,
    command: {
      command: 'chromiumide.chrome.build',
      title: 'Lacros deploy',
    },
  });

  let onSaveFn = () => {};
  vscode.workspace.onDidSaveTextDocument(() => {
    onSaveFn();
  });

  const buildCommand = vscodeRegisterCommand('chromiumide.chrome.build', () => {
    buildChromeDir(
      config.chrome.ashBuildDir.get(),
      'ash',
      config.chrome.dutName.get(),
      config.board.get(),
      statusManager
    );
    buildChromeDir(
      'out_device_lacros/Release',
      'lacros',
      config.chrome.dutName.get(),
      config.board.get(),
      statusManager
    );
  });

  context.subscriptions.push(buildCommand);

  const watchBuildCommand = vscodeRegisterCommand(
    'chromiumide.chrome.watchBuild',
    () => {
      // In order to determine if we need to immediately kick off a new build after an old one has
      // finished, have a variable which tracks if a save was made while a build was running.
      let hasBeenANewSaveAsh = false;
      let hasBeenANewSaveLacros = false;
      let isAshBuilding = true;
      let isLacrosBuilding = true;
      const run = (ashCallback: () => void, lacrosCallback: () => void) => {
        buildChromeDir(
          config.chrome.ashBuildDir.get(),
          'ash',
          config.chrome.dutName.get(),
          config.board.get(),
          statusManager,
          ashCallback
        );
        buildChromeDir(
          'out_device_lacros/Release',
          'lacros',
          config.chrome.dutName.get(),
          config.board.get(),
          statusManager,
          lacrosCallback
        );
      };

      const ashCallback = () => {
        isAshBuilding = false;
        if (hasBeenANewSaveAsh) {
          hasBeenANewSaveAsh = false;
          isAshBuilding = true;
          buildChromeDir(
            config.chrome.ashBuildDir.get(),
            'ash',
            config.chrome.dutName.get(),
            config.board.get(),
            statusManager,
            ashCallback
          );
        }
      };

      const lacrosCallback = () => {
        isLacrosBuilding = false;
        if (hasBeenANewSaveLacros) {
          hasBeenANewSaveLacros = false;
          isLacrosBuilding = true;

          buildChromeDir(
            'out_device_lacros/Release',
            'lacros',
            config.chrome.dutName.get(),
            config.board.get(),
            statusManager,
            lacrosCallback
          );
        }
      };
      onSaveFn = () => {
        hasBeenANewSaveAsh = true;
        hasBeenANewSaveLacros = true;
        if (!isAshBuilding) {
          ashCallback();
        }
        if (!isLacrosBuilding) {
          lacrosCallback();
        }
      };
      run(ashCallback, lacrosCallback);
    }
  );

  context.subscriptions.push(watchBuildCommand);
}
