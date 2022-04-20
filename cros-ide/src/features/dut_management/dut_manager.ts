// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * This contains the GUI and functionality for managing DUTs
 */
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import * as ideUtil from '../../ide_util';
import * as metrics from '../../features/metrics/metrics';
import * as fleetProvider from './services/fleet_devices_provider';
import * as vnc from './services/vnc_session';
import * as localProvider from './services/local_devices_provider';

type Tag = {
  key: string;
  value?: string;
};

type Build = {
  id: string;
  createdBy: string;
  createTime: string;
  startTime: string;
  status: string;
  tags: Tag[];
};

type DUT = {
  Hostname: string;
};

type Lease = {
  Build: Build;
  DUT: DUT;
};

export type Leases = {
  Leases: Lease[];
};

export class DeviceInfo extends vscode.TreeItem {
  constructor(host: string, version: string) {
    super(host, vscode.TreeItemCollapsibleState.None);
    this.description = version;
    this.iconPath = new vscode.ThemeIcon('device-desktop');
  }
}

export async function activateDutManager(context: vscode.ExtensionContext) {
  // TODO: reenable when we start work on crosfleet
  // We need 'version', because without args crosfleet exits with error 2.
  // const crosfleetVersion = await commonUtil.exec('crosfleet', ['version']);
  // if (crosfleetVersion instanceof Error) {
  //   vscode.window.showWarningMessage(`DUT manager will not work,` +
  //       ` because running 'crosfleet' failed: ${crosfleetVersion}`);
  //   return;
  // }

  rsaKeyFixPermission(context);
  const testRsaPath = ideUtil.getTestingRsaPath(context);
  const localDevicesProvider = new localProvider.LocalDevicesProvider(
    testRsaPath
  );
  const fleetDevicesProvider = new fleetProvider.FleetDevicesProvider(
    testRsaPath
  );
  const sessions = new Map<string, vnc.VncSession>();

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'cros-ide.connectToHostForScreen',
      async (host?: string) => {
        // If the command is selected directly from the command palette,
        // prompt the user for the host to connect to.
        if (!host) {
          host = await promptHost('Connect to Host');
          if (!host) {
            return;
          }
        }

        // If there's an existing session, just reveal its panel.
        const existingSession = sessions.get(host);
        if (existingSession) {
          existingSession.revealPanel();
          return;
        }

        // Create a new session and store it to sessions.
        const newSession = new vnc.VncSession(host, context);
        sessions.set(host, newSession);
        newSession.onDidDispose(() => {
          sessions.delete(host!);
        });

        metrics.send({
          category: 'dut',
          action: 'connect to host',
          label: 'screen',
        });
      }
    ),
    vscode.commands.registerCommand(
      'cros-ide.connectToHostForShell',
      async (host?: string) => {
        // If the command is selected directly from the command palette,
        // prompt the user for the host to connect to.
        if (!host) {
          host = await promptHost('Connect to Host');
          if (!host) {
            return;
          }
        }

        // Create a new terminal.
        const terminal = ideUtil.createTerminalForHost(
          host,
          'CrOS: Shell',
          context
        );
        terminal.show();

        metrics.send({
          category: 'dut',
          action: 'connect to host',
          label: 'shell',
        });
      }
    ),
    vscode.commands.registerCommand('cros-ide.addHost', async () => {
      const host = await promptHost('Add New Host');
      if (!host) {
        return;
      }

      const configRoot = ideUtil.getConfigRoot();
      const hosts = configRoot.get<string[]>('hosts') || [];
      hosts.push(host);
      configRoot.update('hosts', hosts, vscode.ConfigurationTarget.Global);

      metrics.send({category: 'dut', action: 'add host'});
    }),
    vscode.commands.registerCommand(
      'cros-ide.deleteHost',
      async (host?: string) => {
        // If the command is selected directly from the command palette,
        // prompt the user for the host to connect to.
        if (!host) {
          host = await promptHost('Delete Host');
          if (!host) {
            return;
          }
        }

        // Try deleting crossfleet first. If not found, then try deleting
        // from "my devices"
        if (!(await fleetDevicesProvider.removeTreeItem(host))) {
          const configRoot = ideUtil.getConfigRoot();
          const oldHosts = configRoot.get<string[]>('hosts') || [];
          const newHosts = oldHosts.filter(h => h !== host);
          configRoot.update(
            'hosts',
            newHosts,
            vscode.ConfigurationTarget.Global
          );
        }
        metrics.send({category: 'dut', action: 'delete'});
      }
    ),
    vscode.commands.registerCommand('cros-ide.refreshCrosfleet', () => {
      fleetDevicesProvider.updateCache();
    }),
    vscode.commands.registerCommand('cros-ide.addFleetHost', async () => {
      const board = await promptBoard('Model');
      await crosfleetDutLease({board});
      fleetDevicesProvider.updateCache();
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('cros-ide')) {
        localDevicesProvider.onConfigChanged();
      }
    }),
    vscode.window.registerTreeDataProvider(
      'static-devices',
      localDevicesProvider
    ),
    vscode.window.registerTreeDataProvider(
      'fleet-devices',
      fleetDevicesProvider
    )
  );
}

/**
 * Ensures that test_rsa key perms are 0600, otherwise cannot be used for ssh
 */
async function rsaKeyFixPermission(context: vscode.ExtensionContext) {
  const rsaKeyPath = ideUtil.getTestingRsaPath(context);
  await fs.promises.chmod(rsaKeyPath, '0600').catch(_err => {
    vscode.window.showErrorMessage(
      'Fatal: unable to update testing_rsa permission: ' + rsaKeyPath
    );
  });
}

async function promptHost(title: string): Promise<string | undefined> {
  return await vscode.window.showInputBox({
    title: title,
    placeHolder: 'host[:port]',
  });
}

async function promptBoard(title: string): Promise<string | undefined> {
  return await vscode.window.showInputBox({
    title: title,
    placeHolder: 'board',
  });
}

// TODO(lokeric): remove this code if unnecessary.
/*
function crosfleetBoard(lease: Lease): string | undefined {
  for (const tag of lease.Build.tags) {
    if (tag.key === 'label-board') {
      return tag.value;
    }
  }
  return undefined;
}
*/

type LeaseOpts = {
  board?: string;
  // dev?: boolean;
  // dims?: {key: string, value: string}[];
  // host?: string;
  minutes?: number;
  // model?: string;
  reason?: string;
};

async function crosfleetDutLease(opts?: LeaseOpts): Promise<Lease> {
  const args = ['dut', 'lease', '-json'];
  if (opts?.board !== undefined) {
    args.push('-board', opts?.board);
  }
  if (opts?.minutes !== undefined) {
    args.push('-minutes', opts?.minutes.toFixed(0));
  }
  if (opts?.reason !== undefined) {
    args.push('-reason', opts?.reason);
  }
  const res = await commonUtil.exec('crosfleet', args);
  if (res instanceof Error) {
    metrics.send({
      category: 'crosfleet',
      action: 'lease dut',
      label: 'Failed: {res.stderr}',
    });
    throw res;
  }
  metrics.send({category: 'crosfleet', action: 'lease dut'});
  return JSON.parse(res.stdout) as Lease;
}
