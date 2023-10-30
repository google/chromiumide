// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * This contains the GUI and functionality for managing devices
 */
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as cipd from '../../common/cipd';
import * as services from '../../services';
import * as bgTaskStatus from '../../ui/bg_task_status';
import {TaskStatus} from '../../ui/bg_task_status';
import * as abandonedDevices from './abandoned_devices';
import * as commands from './commands';
import * as crosfleet from './crosfleet';
import * as repository from './device_repository';
import * as provider from './device_tree_data_provider';
import * as sshUtil from './ssh_util';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  chromiumosServices: services.chromiumos.ChromiumosServiceModule,
  cipdRepository: cipd.CipdRepository
): void {
  rsaKeyFixPermission(context.extensionUri);

  const output = vscode.window.createOutputChannel(
    'ChromiumIDE: Device Management'
  );
  const crosfleetRunner = new crosfleet.CrosfleetRunner(cipdRepository, output);
  const abandonedDuts = new abandonedDevices.AbandonedDevices(
    context.globalState
  );
  const deviceRepository = new repository.DeviceRepository(
    crosfleetRunner,
    abandonedDuts
  );
  const commandsDisposable = commands.registerCommands(
    context,
    chromiumosServices,
    output,
    deviceRepository,
    crosfleetRunner,
    abandonedDuts
  );
  const deviceTreeDataProvider = new provider.DeviceTreeDataProvider(
    deviceRepository
  );

  context.subscriptions.push(
    deviceRepository,
    commandsDisposable,
    deviceTreeDataProvider
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('devices', deviceTreeDataProvider)
  );

  statusManager.setTask('Device Management', {
    status: TaskStatus.OK,
    command: {
      command: 'chromiumide.deviceManagement.openLogs',
      title: 'Open Device Management Logs',
    },
  });
}

/**
 * Ensures that test_rsa key perms are 0600, otherwise cannot be used for ssh
 */
function rsaKeyFixPermission(extensionUri: vscode.Uri) {
  const rsaKeyPath = sshUtil.getTestingRsaPath(extensionUri);
  try {
    fs.chmodSync(rsaKeyPath, '0600');
  } catch {
    void vscode.window.showErrorMessage(
      'Fatal: unable to update testing_rsa permission: ' + rsaKeyPath
    );
  }
}
