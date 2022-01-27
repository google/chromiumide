// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Manages Local Devices
 */
import * as vscode from 'vscode';
import * as ideutil from '../../ide_utilities';
import * as dut_manager from '../dut_manager';
import * as dutServices from './dut_services';

export class LocalDevicesProvider implements vscode.TreeDataProvider<string> {
  private readonly cachedVersions = new Map<string, string>();

  private onDidChangeTreeDataEmitter = new vscode.EventEmitter<string | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor() {
    this.queryVersions();
  }

  getTreeItem(host: string): dut_manager.DeviceInfo {
    return new dut_manager.DeviceInfo(host, this.cachedVersions.get(host) || '');
  }

  getChildren(parent?: string): string[] {
    if (parent) {
      return [];
    }
    return this.getHosts();
  }

  onConfigChanged(): void {
    this.queryVersions();
    this.onDidChangeTreeDataEmitter.fire();
    // Async, query crosfleet if it exists
    // Refire emitter when we get results in
  }

  private queryVersions(): void {
    for (const host of this.getHosts()) {
      if (this.cachedVersions.has(host)) {
        continue;
      }
      (async () => {
        let version = '???';
        try {
          version = await dutServices.queryHostVersion(host);
        } catch (_) { }
        this.cachedVersions.set(host, version);
        this.onDidChangeTreeDataEmitter.fire();
      })().catch((e) => { });
    }
  }

  private getHosts(): string[] {
    return ideutil.getConfigRoot().get<string[]>('hosts') || [];
  }
}
