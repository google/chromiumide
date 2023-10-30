// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import * as logs from '../logs';
import * as bgTaskStatus from '../ui/bg_task_status';
import {TaskStatus} from '../ui/bg_task_status';

// The gn executable file path in chroot.
const GN_PATH = '/usr/bin/gn';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  log: logs.LoggingBundle
): void {
  // Format a GN file under platform2 on save
  // because cros lint requires formatting upon upload.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      if (document.languageId !== 'gn') {
        return;
      }
      if (!document.uri.path.includes('src/platform2/')) {
        return;
      }

      // Passing an async function to vscode.Event essentially ignores promise
      // results, so we keep this function non-async and ignore results
      // explicitly with void.
      void format(document.uri.fsPath, statusManager, log);
    })
  );
}

async function format(
  fsPath: string,
  statusManager: bgTaskStatus.StatusManager,
  log: logs.LoggingBundle
) {
  const realpath = await fs.promises.realpath(fsPath);
  const chroot = commonUtil.findChroot(realpath);
  if (chroot === undefined) {
    log.channel.appendLine(
      'ERROR: chroot not found when attempting `gn format`'
    );
    return;
  }

  const args = ['format', realpath];
  const res = await commonUtil.exec(path.join(chroot, GN_PATH), args, {
    logger: log.channel,
    ignoreNonZeroExit: true,
    logStdout: true,
  });

  if (res instanceof Error) {
    log.channel.appendLine('ERROR: failed to run `gn format`: ' + res.message);
    statusManager.setTask(log.taskId, {
      status: TaskStatus.ERROR,
      command: log.showLogCommand,
    });
    return;
  }

  // Exit status is 1 for all of these cases:
  // - There was a syntax error in the file. This should be ignored.
  // - Couldn't read the. This should be reported to the user.
  // - Other errors (e.g. wrong subcommand name to gn, etc.)
  // These can be distinguished by the error messages, but it is not a public API.
  if (res.exitStatus === 1 && res.stdout.includes("ERROR Couldn't read")) {
    log.channel.appendLine(
      'ERROR: `gn format` command exited with error: ' + res.stdout
    );
  }
}
