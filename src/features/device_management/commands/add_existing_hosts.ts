// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../../../shared/app/common/driver_repository';
import {OwnedDeviceRepository} from '../device_repository';
import * as sshConfig from '../ssh_config';
import {CommandContext} from './common';

const driver = getDriver();

export const ADD_EXISTING_HOSTS_COMMAND_ID = 'addExistingHosts';

export async function addExistingHostsCommand(
  context: CommandContext
): Promise<void> {
  await addExistingHosts(context.deviceRepository.owned);
}

async function addExistingHosts(
  deviceRepository: OwnedDeviceRepository,
  sshConfigPath: string = sshConfig.defaultConfigPath
): Promise<void> {
  driver.metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_add_existing_hosts',
    description: 'add existing hosts',
  });

  const hostnames = sshConfig.readUnaddedSshHosts(
    deviceRepository,
    sshConfigPath
  );
  const hostsToAdd = await vscode.window.showQuickPick(hostnames, {
    canPickMany: true,
  });
  hostsToAdd?.forEach(host => void deviceRepository.addDevice(host));
}
