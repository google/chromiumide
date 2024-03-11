// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../../../../shared/app/common/vscode/commands';
import * as services from '../../../services';
import {underDevelopment} from '../../../services/config';
import {Breadcrumbs} from '../../chromiumos/boards_and_packages/item';
import {Metrics} from '../../metrics/metrics';
import * as abandonedDevices from '../abandoned_devices';
import * as crosfleet from '../crosfleet';
import * as client from '../device_client';
import * as repository from '../device_repository';
import * as provider from '../device_tree_data_provider';
import {SshIdentity} from '../ssh_identity';
import * as ssh from '../ssh_session';
import * as vnc from '../vnc_session';
import {addExistingHostsCommand} from './add_existing_hosts';
import {
  checkDeviceImageCompatibilityOrSuggest,
  ResultDisplayMode,
} from './check_image';
import {CommandContext} from './common';
import {connectToDeviceForShell} from './connect_ssh';
import {connectToDeviceForScreen} from './connect_vnc';
import {copyAttribute, copyHostname} from './copy_device_attribute';
import {crosfleetLogin} from './crosfleet_login';
import {deployToDevice} from './deploy_package';
import {addDevice} from './device_add';
import {deleteDevice} from './device_delete';
import {flashPrebuiltImage} from './flash_prebuilt_image';
import {abandonLease} from './lease_abandon';
import {addLease} from './lease_add';
import {refreshLeases} from './lease_refresh';
import {setDefaultDevice} from './set_default_device';
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
  abandonedDevices: abandonedDevices.AbandonedDevices,
  deviceClient: client.DeviceClient
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
    deviceClient,
  };

  return vscode.Disposable.from(
    vscodeRegisterCommand('chromiumide.deviceManagement.addExistingHosts', () =>
      addExistingHostsCommand(context)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.setDefaultDevice',
      (item: provider.DeviceItem) => setDefaultDevice(item.hostname)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.deleteDevice',
      (item?: provider.DeviceItem) => deleteDevice(context, item?.hostname)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.connectToDeviceForScreen',
      (item?: provider.DeviceItem) =>
        connectToDeviceForScreen(context, /* rotate = */ false, item?.hostname)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.connectToDeviceForRotatedScreen',
      (item?: provider.DeviceItem) =>
        connectToDeviceForScreen(context, /* rotate = */ true, item?.hostname)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.connectToDeviceForShell',
      (item?: provider.DeviceItem) =>
        connectToDeviceForShell(context, item?.hostname)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.openSystemLogViewer',
      (item?: provider.DeviceItem) =>
        openSystemLogViewer(context, item?.hostname)
    ),
    vscodeRegisterCommand('chromiumide.deviceManagement.crosfleetLogin', () =>
      crosfleetLogin(context)
    ),
    vscodeRegisterCommand('chromiumide.deviceManagement.refreshLeases', () =>
      refreshLeases(context)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.abandonLease',
      (item?: provider.DeviceItem) => abandonLease(context, item?.hostname)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.copyHostname',
      (item: provider.DeviceItem) => copyHostname(context, item)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.copyBoard',
      (item: provider.DeviceAttributeItem) => copyAttribute(context, item)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.copyModel',
      (item: provider.DeviceAttributeItem) => copyAttribute(context, item)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.copyCrOsReleaseVersion',
      (item: provider.DeviceAttributeItem) => copyAttribute(context, item)
    ),
    vscodeRegisterCommand(
      'chromiumide.deviceManagement.copyBuilderPath',
      (item: provider.DeviceAttributeItem) => copyAttribute(context, item)
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
      vscodeRegisterCommand('chromiumide.deviceManagement.addDevice', () =>
        addDevice(context, chrootService)
      ),
      vscodeRegisterCommand('chromiumide.deviceManagement.addLease', () =>
        addLease(context, chrootService)
      ),
      vscodeRegisterCommand(
        'chromiumide.deviceManagement.flashPrebuiltImage',
        (item?: provider.DeviceItem) =>
          flashPrebuiltImage(context, chrootService, item?.hostname)
      ),
      vscodeRegisterCommand(
        'chromiumide.deviceManagement.deployToDevice',
        (item?: provider.DeviceItem) =>
          deployToDevice(context, chrootService, item?.hostname)
      ),
      vscodeRegisterCommand(
        'chromiumide.deviceManagement.deployPackage',
        ({breadcrumbs: [board, category, name]}: Breadcrumbs) =>
          deployToDevice(
            context,
            chrootService,
            undefined,
            `${category}/${name}`,
            board
          )
      )
    );

    if (chrootService) {
      subscriptions.push(
        vscodeRegisterCommand(
          'chromiumide.deviceManagement.checkDeviceImageCompatibilityOrSuggest',
          async (item: provider.DeviceItem) => {
            const outcome = await checkDeviceImageCompatibilityOrSuggest(
              context,
              chrootService,
              item?.hostname
            );
            if (outcome instanceof Error) {
              Metrics.send({
                category: 'error',
                group: 'device',
                name: 'device_management_check_or_suggest_image_error',
                description: 'check image compatibility command failed',
                outcome: 'error flashing image',
              });
            } else {
              Metrics.send({
                category: 'interactive',
                group: 'device',
                name: 'device_management_check_or_suggest_image',
                description: 'check image compatibility command completed',
                outcome: outcome,
              });
            }
          }
        ),
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

      if (event?.chrootService) {
        void checkImageOfDefaultDevice(context, event.chrootService);
      }
    }),
    new vscode.Disposable(disposeSubscriptions)
  );
}

async function checkImageOfDefaultDevice(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService
): Promise<void> {
  const defaultDevice = (await context.deviceRepository.getDevices()).find(d =>
    repository.isDefaultDevice(d)
  );
  if (!defaultDevice) return;
  const outcome = await checkDeviceImageCompatibilityOrSuggest(
    context,
    chrootService,
    defaultDevice.hostname,
    ResultDisplayMode.MESSAGE
  );
  // Report on outcome to understand usefulness of the feature.
  Metrics.send({
    category: 'background',
    group: 'device',
    name: 'device_management_default_device_image_check',
    description: 'image check of default device on activation',
    outcome: outcome instanceof Error ? 'error' : outcome,
  });
}
