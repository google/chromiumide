// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../../../common/vscode/commands';
import {Metrics} from '../../../features/metrics/metrics';
import * as services from '../../../services';
import * as bgTaskStatus from '../../../ui/bg_task_status';
import {SHOW_LOG_COMMAND} from './constants';
import * as statusBar from './status_bar';
import * as tasks from './tasks';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  chrootService: services.chromiumos.ChrootService
): void {
  // We are using one output channel for all platform EC related tasks.
  // TODO(b:236389226): when servod is integrated, send its logs somewhere else
  const outputChannel = vscode.window.createOutputChannel(
    'ChromiumIDE: Platform EC'
  );
  context.subscriptions.push(
    vscodeRegisterCommand(SHOW_LOG_COMMAND.command, () => {
      outputChannel.show();
      Metrics.send({
        category: 'interactive',
        group: 'idestatus',
        name: 'platform_ec_show_log',
        description: 'show platform ec log',
      });
    })
  );

  // TODO(b:236389226): Make sure the features are available only if
  // we are in platform/ec or they are needed otherwise (for example, tasks.json).

  statusBar.activate(context);
  tasks.activate(context, statusManager, chrootService, outputChannel);
}
