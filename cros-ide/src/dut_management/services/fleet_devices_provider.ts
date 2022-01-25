// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Manages Leased Devices
 */
import * as vscode from 'vscode';
import * as ideutil from '../../ide_utilities';
import * as dutManager from '../dut_manager';
import * as dutServices from './dut_services';

type CrosfleetDutInfo = {
  hostname: string;
  version?: string;
};

export class FleetDevicesProvider implements vscode.TreeDataProvider<string> {
  private leases: Map<string, CrosfleetDutInfo>;

  private onDidChangeTreeDataEmitter = new vscode.EventEmitter<string | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor() {
    this.leases = new Map();
    this.updateCache();
  }

  async updateCache() {
    // TODO: animations while we are loading?
    // Query duts.
    const leases = await dutServices.crosfleetLeases();
    this.leases = new Map(leases.Leases.map(l => [
      l.DUT.Hostname + '.cros',
      {
        hostname: l.DUT.Hostname + '.cros',
      },
    ]));
    this.onDidChangeTreeDataEmitter.fire();

    // Update versions in parallel.
    for (const dut of this.leases.values()) {
      if (dut.version !== undefined) {
        continue;
      }
      (async () => {
        let version = '???';
        try {
          version = await dutServices.queryHostVersion(dut.hostname);
        } catch (_) { }
        dut.version = version;
        this.onDidChangeTreeDataEmitter.fire();
      })().catch((e) => { });
    }
  }

  async removeTreeItem(host: string): Promise<boolean> {
    if (this.leases.delete(host)) {
      await dutServices.crosfleetDutAbandon(host);
      this.onDidChangeTreeDataEmitter.fire();
      return true;
    } else {
      return false;
    }
  }

  getTreeItem(host: string): dutManager.DeviceInfo {
    return new dutManager.DeviceInfo(host, this.leases.get(host)?.version || '');
  }

  getChildren(parent?: string): string[] {
    if (parent) {
      return [];
    }
    return [...this.leases.keys()];
  }

  private queryDuts(): void {
    dutServices.crosfleetLeases().then();
  }

  private getHosts(): string[] {
    return ideutil.getConfigRoot().get<string[]>('hosts') || [];
  }
}
