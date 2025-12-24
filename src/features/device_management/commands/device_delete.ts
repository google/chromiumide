// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../../../shared/app/common/driver_repository';
import * as sshConfig from '../ssh_config';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

const driver = getDriver();

export async function deleteDevice(
  context: CommandContext,
  selectedHostname?: string
): Promise<void> {
  driver.metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_delete_device',
    description: 'delete device',
  });

  const hostname = await promptKnownHostnameIfNeeded(
    'Delete Device',
    selectedHostname,
    context.deviceRepository.owned,
    false // User probably does not want to delete their default device.
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
