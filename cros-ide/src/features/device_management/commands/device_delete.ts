// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Metrics} from '../../metrics/metrics';
import * as provider from '../device_tree_data_provider';
import * as sshConfig from '../ssh_config';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

export async function deleteDevice(
  context: CommandContext,
  item?: provider.DeviceItem
): Promise<void> {
  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_delete_device',
    description: 'delete device',
  });

  const hostname = await promptKnownHostnameIfNeeded(
    'Delete Device',
    item,
    context.deviceRepository.owned
  );
  if (!hostname) {
    return;
  }

  await context.deviceRepository.owned.removeDevice(hostname);
  await optionallyRemoveFromSshConfig(hostname);
}

async function optionallyRemoveFromSshConfig(hostname: string) {
  const hosts = await sshConfig.readConfiguredSshHosts();
  if (hosts.find(h => h === hostname)) {
    const remove = await vscode.window.showInformationMessage(
      `Remove '${hostname}' from your ssh config file also?`,
      'Remove',
      'Keep'
    );
    if (remove === 'Remove') {
      await sshConfig.removeSshConfigEntry(hostname);
    }
  }
}
