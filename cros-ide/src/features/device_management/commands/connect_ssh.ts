// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../common/common_util';
import {MemoryOutputChannel} from '../../../common/memory_output_channel';
import * as shutil from '../../../common/shutil';
import {TeeOutputChannel} from '../../../common/tee_output_channel';
import {Metrics} from '../../metrics/metrics';
import * as provider from '../device_tree_data_provider';
import {
  createShowLogsButton,
  diagnoseSshError,
  showErrorMessageWithButtons,
} from '../diagnostic';
import * as sshUtil from '../ssh_util';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

export async function connectToDeviceForShell(
  context: CommandContext,
  item?: provider.DeviceItem
): Promise<void> {
  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_connect_to_device_ssh',
    description: 'connect to device with SSH',
  });

  const hostname = await promptKnownHostnameIfNeeded(
    'Connect to Device',
    item,
    context.deviceRepository
  );
  if (!hostname) {
    return;
  }

  // Create a new terminal.
  const terminal = vscode.window.createTerminal(hostname);
  terminal.sendText(
    'exec ' +
      shutil.escapeArray(sshUtil.buildSshCommand(hostname, context.sshIdentity))
  );
  terminal.show();

  const errorMessageProvider = vscode.window.onDidCloseTerminal(
    async closedTerminal => {
      if (terminal !== closedTerminal) return;

      errorMessageProvider.dispose();

      // ssh exits with the exit status of the remote command or with 255 if an error occurred.
      if (terminal.exitStatus?.code !== 255) return;

      await checkSshConnection(context, hostname);
    }
  );
}

/**
 * Checks the SSH connection works. Shows an error message to the user on
 * failure.
 */
async function checkSshConnection(
  context: CommandContext,
  hostname: string
): Promise<void> {
  const args = sshUtil.buildSshCommand(
    hostname,
    context.sshIdentity,
    [],
    'true'
  );

  const memoryOutput = new MemoryOutputChannel();

  const result = await commonUtil.exec(args[0], args.slice(1), {
    logger: new TeeOutputChannel(memoryOutput, context.output),
  });

  if (result instanceof Error) {
    const err = diagnoseSshError(result, memoryOutput.output);

    const message = 'SSH connection failed: ' + err.message;
    context.output.appendLine(message);

    showErrorMessageWithButtons(message, [
      ...err.buttons,
      createShowLogsButton(context.output),
    ]);
  }
}
