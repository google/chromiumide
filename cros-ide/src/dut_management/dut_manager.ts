// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * This contains the GUI and functionality for managing DUTs
 */
import * as vscode from 'vscode';
import * as ideutil from '../ide_utilities';
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

export function activateDutManager(context: vscode.ExtensionContext) {
  const staticDevicesProvider = new localProvider.LocalDevicesProvider();
  const fleetDevicesProvider = new fleetProvider.FleetDevicesProvider();
  const sessions = new Map<string, vnc.VncSession>();

  context.subscriptions.push(
    vscode.commands.registerCommand('cros-ide.connectToHostForScreen', async (host?: string) => {
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
      const newSession = new vnc.VncSession(host, context.extensionUri);
      sessions.set(host, newSession);
      newSession.onDidDispose(() => {
        sessions.delete(host!);
      });
    }),
    vscode.commands.registerCommand('cros-ide.connectToHostForShell', async (host?: string) => {
      // If the command is selected directly from the command palette,
      // prompt the user for the host to connect to.
      if (!host) {
        host = await promptHost('Connect to Host');
        if (!host) {
          return;
        }
      }

      // Create a new terminal.
      const terminal = ideutil.createTerminalForHost(host, 'CrOS: Shell', context.extensionUri, '');
      terminal.show();
    }),
    vscode.commands.registerCommand('cros-ide.addHost', async () => {
      const host = await promptHost('Add New Host');
      if (!host) {
        return;
      }

      const configRoot = ideutil.getConfigRoot();
      const hosts = configRoot.get<string[]>('hosts') || [];
      hosts.push(host);
      configRoot.update('hosts', hosts, vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('cros-ide.deleteHost', async (host?: string) => {
      // If the command is selected directly from the command palette,
      // prompt the user for the host to connect to.
      if (!host) {
        host = await promptHost('Delete Host');
        if (!host) {
          return;
        }
      }

      // Try deleting crossfleet first. If not found, then try deleting from "my devices"
      if (!fleetDevicesProvider.removeTreeItem(host)) {
        const configRoot = ideutil.getConfigRoot();
        const oldHosts = configRoot.get<string[]>('hosts') || [];
        const newHosts = oldHosts.filter((h) => (h !== host));
        configRoot.update('hosts', newHosts, vscode.ConfigurationTarget.Global);
      }
    }),
    vscode.commands.registerCommand('cros-ide.refreshCrosfleet', () => {
      fleetDevicesProvider.updateCache();
    }),
    vscode.commands.registerCommand('cros-ide.addFleetHost', async () => {
      const board = await promptBoard('Model');
      const lease = await crosfleetDutLease({board});
      // HACK: copy over binaries.
      // TODO: Removing prebuilts till we have an alterative solution
      // const prebuilt = vscode.Uri.joinPath(context.extensionUri, 'resources', 'novnc-prebuilt.tar.gz');
      // await util.execFile(`ssh ${lease.DUT.Hostname + '.cros'} tar xz -C /usr/local < ${prebuilt.fsPath}`);
      // fleetDevicesProvider.updateCache();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cros')) {
        staticDevicesProvider.onConfigChanged();
      }
    }),
    vscode.window.registerTreeDataProvider('static-devices', staticDevicesProvider),
    vscode.window.registerTreeDataProvider('fleet-devices', fleetDevicesProvider),
  );
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

function crosfleetBoard(lease: Lease): string | undefined {
  for (const tag of lease.Build.tags) {
    if (tag.key === 'label-board') {
      return tag.value;
    }
  }
  return undefined;
}

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
  const out = await ideutil.execFile('crosfleet', args);
  return JSON.parse(out.stdout) as Lease;
}
