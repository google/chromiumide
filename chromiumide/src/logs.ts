// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as vscode from 'vscode';
import {vscodeRegisterCommand} from './common/vscode/commands';
import {Metrics} from './features/metrics/metrics';

// outputChannel for log output, and command to show it.
export interface LoggingBundle {
  readonly channel: vscode.OutputChannel;
  readonly showLogCommand: vscode.Command;
  readonly taskId: string;
}

export function createLinterLoggingBundle(
  context: vscode.ExtensionContext
): LoggingBundle {
  return createLoggingBundle(
    context,
    'ChromiumIDE: Linter',
    'chromiumide.showLintLog',
    'Show linter log',
    'Linter'
  );
}

// Creates a logging channel for a background task and a command to show its log.
function createLoggingBundle(
  context: vscode.ExtensionContext,
  outputChannelName: string,
  commandName: string,
  commandTitle: string,
  taskId: string
): LoggingBundle {
  const channel = vscode.window.createOutputChannel(outputChannelName);
  const showLogCommand: vscode.Command = {
    command: commandName,
    title: commandTitle,
  };
  context.subscriptions.push(
    vscodeRegisterCommand(showLogCommand.command, () => {
      channel.show();
      Metrics.send({
        category: 'interactive',
        group: 'idestatus',
        description: 'show linter log',
        name: 'idestatus_show_linter_log',
      });
    })
  );
  return {
    channel: channel,
    showLogCommand: showLogCommand,
    taskId: taskId,
  };
}
