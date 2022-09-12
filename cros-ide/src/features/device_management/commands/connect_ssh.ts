// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as shutil from '../../../common/shutil';
import * as metrics from '../../metrics/metrics';
import * as provider from '../device_tree_data_provider';
import * as sshUtil from '../ssh_util';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

export async function connectToDeviceForShell(
  context: CommandContext,
  item?: provider.DeviceItem
): Promise<void> {
  metrics.send({
    category: 'interactive',
    group: 'device',
    action: 'connect to device with SSH',
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
      shutil.escapeArray(
        sshUtil.buildSshCommand(hostname, context.extensionContext.extensionUri)
      )
  );
  terminal.show();
}
