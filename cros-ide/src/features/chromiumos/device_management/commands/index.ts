// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as services from '../../../../services';
import * as abandonedDevices from '../abandoned_devices';
import * as crosfleet from '../crosfleet';
import * as repository from '../device_repository';
import * as provider from '../device_tree_data_provider';
import * as ssh from '../ssh_session';
import * as vnc from '../vnc_session';
import {CommandContext} from './common';
import {connectToDeviceForShell} from './connect_ssh';
import {connectToDeviceForScreen} from './connect_vnc';
import {copyHostname} from './copy_hostname';
import {crosfleetLogin} from './crosfleet_login';
import {addDevice} from './device_add';
import {addExistingHostsCommand} from './add_existing_hosts';
import {deleteDevice} from './device_delete';
import {flashPrebuiltImage} from './flash_prebuilt_image';
import {abandonLease} from './lease_abandon';
import {addLease} from './lease_add';
import {refreshLeases} from './lease_refresh';
import {runTastTests} from './run_tast_tests';
import {openSystemLogViewer} from './syslog_viewer';
import {browseChromeOsBuilds} from './browse_chromeos_builds';

/**
 * Registers VSCode commands for device management features.
 */
export function registerCommands(
  extensionContext: vscode.ExtensionContext,
  chromiumosServices: services.chromiumos.ChromiumosServiceModule,
  output: vscode.OutputChannel,
  deviceRepository: repository.DeviceRepository,
  crosfleetRunner: crosfleet.CrosfleetRunner,
  abandonedDevices: abandonedDevices.AbandonedDevices
): vscode.Disposable {
  const vncSessions = new Map<string, vnc.VncSession>();
  const sshSessions = new Map<string, ssh.SshSession>();

  const context: CommandContext = {
    extensionContext,
    output,
    deviceRepository,
    crosfleetRunner,
    vncSessions,
    sshSessions,
    abandonedDevices,
  };

  return vscode.Disposable.from(
    vscode.commands.registerCommand('cros-ide.deviceManagement.addDevice', () =>
      addDevice(context)
    ),
    vscode.commands.registerCommand(
      'cros-ide.deviceManagement.addExistingHosts',
      () => addExistingHostsCommand(context)
    ),
    vscode.commands.registerCommand(
      'cros-ide.deviceManagement.browseChromeOsBuilds',
      () => browseChromeOsBuilds(context)
    ),
    vscode.commands.registerCommand(
      'cros-ide.deviceManagement.deleteDevice',
      (item?: provider.DeviceItem) => deleteDevice(context, item)
    ),
    vscode.commands.registerCommand(
      'cros-ide.deviceManagement.connectToDeviceForScreen',
      (item?: provider.DeviceItem) => connectToDeviceForScreen(context, item)
    ),
    vscode.commands.registerCommand(
      'cros-ide.deviceManagement.connectToDeviceForShell',
      (item?: provider.DeviceItem) => connectToDeviceForShell(context, item)
    ),
    vscode.commands.registerCommand(
      'cros-ide.deviceManagement.openSystemLogViewer',
      (item?: provider.DeviceItem) => openSystemLogViewer(context, item)
    ),
    vscode.commands.registerCommand(
      'cros-ide.deviceManagement.crosfleetLogin',
      () => crosfleetLogin(context)
    ),
    vscode.commands.registerCommand(
      'cros-ide.deviceManagement.refreshLeases',
      () => refreshLeases(context)
    ),
    vscode.commands.registerCommand('cros-ide.deviceManagement.addLease', () =>
      addLease(context)
    ),
    vscode.commands.registerCommand(
      'cros-ide.deviceManagement.abandonLease',
      (item?: provider.DeviceItem) => abandonLease(context, item)
    ),
    vscode.commands.registerCommand(
      'cros-ide.deviceManagement.copyHostname',
      (item: provider.DeviceItem) => copyHostname(context, item)
    ),
    vscode.commands.registerCommand(
      'cros-ide.deviceManagement.openLogs',
      () => {
        output.show();
      }
    ),
    registerChromiumosCommands(context, chromiumosServices)
  );
}

function registerChromiumosCommands(
  context: CommandContext,
  chromiumosServices: services.chromiumos.ChromiumosServiceModule
): vscode.Disposable {
  const subscriptions: vscode.Disposable[] = [];

  const disposeSubscriptions = () => {
    vscode.Disposable.from(...subscriptions).dispose();
    subscriptions.length = 0;
  };

  return vscode.Disposable.from(
    chromiumosServices.onDidUpdate(event => {
      disposeSubscriptions();

      const chrootService = event?.chrootService;
      if (chrootService) {
        subscriptions.push(
          vscode.commands.registerCommand(
            'cros-ide.deviceManagement.flashPrebuiltImage',
            (item?: provider.DeviceItem) =>
              flashPrebuiltImage(context, chrootService, item)
          ),
          vscode.commands.registerCommand(
            'cros-ide.deviceManagement.runTastTests',
            () => runTastTests(context, chrootService)
          )
        );
      }
    }),
    new vscode.Disposable(disposeSubscriptions)
  );
}
