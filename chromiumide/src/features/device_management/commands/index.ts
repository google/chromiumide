// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../../../common/vscode/commands';
import * as services from '../../../services';
import {underDevelopment} from '../../../services/config';
import * as abandonedDevices from '../abandoned_devices';
import * as crosfleet from '../crosfleet';
import * as repository from '../device_repository';
import * as provider from '../device_tree_data_provider';
import {SshIdentity} from '../ssh_identity';
import * as ssh from '../ssh_session';
import * as vnc from '../vnc_session';
import {addExistingHostsCommand} from './add_existing_hosts';
import {CommandContext} from './common';
import {connectToDeviceForShell} from './connect_ssh';
import {connectToDeviceForScreen} from './connect_vnc';
import {copyHostname} from './copy_hostname';
import {crosfleetLogin} from './crosfleet_login';
import {addDevice} from './device_add';
import {deleteDevice} from './device_delete';
import {flashPrebuiltImage} from './flash_prebuilt_image';
import {abandonLease} from './lease_abandon';
import {addLease} from './lease_add';
import {refreshLeases} from './lease_refresh';
import {openSystemLogViewer} from './syslog_viewer';
import {debugTastTests, runTastTests} from './tast';

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

  const sshIdentity = new SshIdentity(
    extensionContext.extensionUri,
    chromiumosServices
  );

  const context: CommandContext = {
    extensionContext,
    output,
    deviceRepository,
    crosfleetRunner,
    vncSessions,
    sshSessions,
    abandonedDevices,
    sshIdentity,
  };

  return vscode.Disposable.from(
    vscodeRegisterCommand('chromiumide.deviceManagement.addDevice', () =>
      addDevice(context)
    ),
    vscodeRegisterCommand('chromiumide.deviceManagement.addExistingHosts', () =>
      addExistingHostsCommand(context)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.deleteDevice',
      (item?: provider.DeviceItem) => deleteDevice(context, item)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.connectToDeviceForScreen',
      (item?: provider.DeviceItem) =>
        connectToDeviceForScreen(context, /* rotate = */ false, item)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.connectToDeviceForRotatedScreen',
      (item?: provider.DeviceItem) =>
        connectToDeviceForScreen(context, /* rotate = */ true, item)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.connectToDeviceForShell',
      (item?: provider.DeviceItem) => connectToDeviceForShell(context, item)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.openSystemLogViewer',
      (item?: provider.DeviceItem) => openSystemLogViewer(context, item)
    ),
    vscodeRegisterCommand('chromiumide.deviceManagement.crosfleetLogin', () =>
      crosfleetLogin(context)
    ),
    vscodeRegisterCommand('chromiumide.deviceManagement.refreshLeases', () =>
      refreshLeases(context)
    ),
    vscodeRegisterCommand('chromiumide.deviceManagement.addLease', () =>
      addLease(context)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.abandonLease',
      (item?: provider.DeviceItem) => abandonLease(context, item)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.copyHostname',
      (item: provider.DeviceItem) => copyHostname(context, item)
    ),
    vscodeRegisterCommand('chromiumide.deviceManagement.openLogs', () => {
      output.show();
    }),
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

  const updateChromiumosCommands = (
    chrootService?: services.chromiumos.ChrootService
  ) => {
    disposeSubscriptions();

    subscriptions.push(
      vscodeRegisterCommand(
        'chromiumide.deviceManagement.flashPrebuiltImage',
        (item?: provider.DeviceItem) =>
          flashPrebuiltImage(context, chrootService, item)
      )
    );

    if (chrootService) {
      subscriptions.push(
        vscodeRegisterCommand('chromiumide.deviceManagement.runTastTests', () =>
          runTastTests(context, chrootService)
        )
      );
      if (underDevelopment.tastDebugging.get()) {
        subscriptions.push(
          vscodeRegisterCommand(
            'chromiumide.deviceManagement.debugTastTests',
            () => debugTastTests(context, chrootService)
          )
        );
      }
    }
  };

  updateChromiumosCommands(undefined);

  return vscode.Disposable.from(
    chromiumosServices.onDidUpdate(event => {
      updateChromiumosCommands(event?.chrootService);
    }),
    new vscode.Disposable(disposeSubscriptions)
  );
}
