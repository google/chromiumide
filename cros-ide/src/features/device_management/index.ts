// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * This contains the GUI and functionality for managing devices
 */
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as cipd from '../../common/cipd';
import * as chroot from '../../services/chroot';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as commands from './commands';
import * as crosfleet from './crosfleet';
import * as repository from './device_repository';
import * as provider from './device_tree_data_provider';
import * as sshUtil from './ssh_util';

export async function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  chrootService: chroot.ChrootService,
  cipdRepository: cipd.CipdRepository
) {
  await rsaKeyFixPermission(context.extensionUri);

  const output = vscode.window.createOutputChannel(
    'CrOS IDE: Device Management'
  );
  const crosfleetRunner = new crosfleet.CrosfleetRunner(cipdRepository, output);
  const ownedDeviceRepository = new repository.OwnedDeviceRepository();
  const leasedDeviceRepository = new repository.LeasedDeviceRepository(
    crosfleetRunner
  );
  const commandsDisposable = commands.registerCommands(
    context,
    chrootService,
    output,
    ownedDeviceRepository,
    leasedDeviceRepository,
    crosfleetRunner
  );
  const deviceTreeDataProvider = new provider.DeviceTreeDataProvider(
    ownedDeviceRepository,
    leasedDeviceRepository
  );

  context.subscriptions.push(
    ownedDeviceRepository,
    leasedDeviceRepository,
    commandsDisposable,
    deviceTreeDataProvider
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('devices', deviceTreeDataProvider)
  );

  statusManager.setTask('Device Management', {
    status: bgTaskStatus.TaskStatus.OK,
    command: {
      command: 'cros-ide.deviceManagement.openLogs',
      title: 'Open Device Management Logs',
    },
  });
}

/**
 * Ensures that test_rsa key perms are 0600, otherwise cannot be used for ssh
 */
async function rsaKeyFixPermission(extensionUri: vscode.Uri) {
  const rsaKeyPath = sshUtil.getTestingRsaPath(extensionUri);
  try {
    await fs.promises.chmod(rsaKeyPath, '0600');
  } catch {
    void vscode.window.showErrorMessage(
      'Fatal: unable to update testing_rsa permission: ' + rsaKeyPath
    );
  }
}
