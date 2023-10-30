// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as dateFns from 'date-fns';
import * as commonUtil from '../../common/common_util';
import * as config from '../../services/config';
import * as abandonedDevices from './abandoned_devices';
import * as crosfleet from './crosfleet';

// Represents the type of a device.
export enum DeviceCategory {
  // An owned device is a device owned by the user.
  OWNED,
  // A leased device is a device temporarily leased to the user.
  LEASED,
}

export interface Device {
  readonly hostname: string;
}

export interface OwnedDevice extends Device {
  readonly category: DeviceCategory.OWNED;
}

export interface LeasedDevice extends Device {
  readonly category: DeviceCategory.LEASED;
  readonly board: string | undefined;
  readonly model: string | undefined;
  readonly deadline: Date | undefined;
}

/**
 * Maintains a list of owned devices available for the device management feature.
 * The list is backed by a user setting.
 */
export class OwnedDeviceRepository implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  private readonly configMutex = new commonUtil.Mutex<void>();

  readonly onDidChange = this.onDidChangeEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidChangeEmitter,
  ];

  constructor() {
    this.subscriptions.push(
      config.deviceManagement.devices.onDidChange(() =>
        this.onDidChangeEmitter.fire()
      )
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  getDevices(): OwnedDevice[] {
    const hostnames = this.getHostnames();
    return hostnames.map(hostname => ({
      category: DeviceCategory.OWNED,
      hostname,
    }));
  }

  async addDevice(hostname: string): Promise<void> {
    await this.configMutex.runExclusive(async () => {
      const hostnames = this.getHostnames();
      if (hostnames.includes(hostname)) {
        return;
      }
      const newHostnames = [...hostnames, hostname];
      await this.setHostnames(newHostnames);
    });
  }

  async removeDevice(hostname: string): Promise<void> {
    await this.configMutex.runExclusive(async () => {
      const hostnames = this.getHostnames();
      if (!hostnames.includes(hostname)) {
        throw new Error(`Unknown owned host: ${hostname}`);
      }
      const newHostnames = hostnames.filter(h => h !== hostname);
      await this.setHostnames(newHostnames);
    });
  }

  private getHostnames(): string[] {
    return config.deviceManagement.devices.get();
  }

  private async setHostnames(hosts: string[]): Promise<void> {
    await config.deviceManagement.devices.update(hosts);
  }
}

/**
 * Maintains a list of leased devices available for the device management feature.
 * The list is backed by the crosfleet command.
 */
export class LeasedDeviceRepository implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidChangeEmitter,
  ];

  private cachedDevices: Promise<LeasedDevice[]> | undefined = undefined;
  private refreshTimer: vscode.Disposable | undefined = undefined;

  constructor(
    private readonly crosfleetRunner: crosfleet.CrosfleetRunner,
    private readonly abandonedDevice: abandonedDevices.AbandonedDevices
  ) {
    this.subscriptions.push(
      crosfleetRunner.onDidChange(() => {
        this.refresh();
      })
    );
  }

  dispose(): void {
    if (this.refreshTimer) {
      this.refreshTimer.dispose();
      this.refreshTimer = undefined;
    }
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  refresh(): void {
    this.cachedDevices = undefined;
    if (this.refreshTimer) {
      this.refreshTimer.dispose();
      this.refreshTimer = undefined;
    }
    this.onDidChangeEmitter.fire();
  }

  async checkLogin(): Promise<boolean> {
    return await this.crosfleetRunner.checkLogin();
  }

  async getDevices(): Promise<LeasedDevice[]> {
    if (this.cachedDevices === undefined) {
      const devicesPromise = this.getDevicesUncached();
      this.cachedDevices = devicesPromise;
      void this.refreshOnEarliestDeadline(devicesPromise);
    }
    return await this.cachedDevices;
  }

  private async getDevicesUncached(): Promise<LeasedDevice[]> {
    if (!(await this.checkLogin())) {
      return [];
    }

    const leases = await this.crosfleetRunner.listLeases();
    const abandonedLeases = await this.abandonedDevice.fetch();

    const allDevices: LeasedDevice[] = leases.map(l => ({
      category: DeviceCategory.LEASED,
      hostname: l.hostname,
      board: l.board,
      model: l.model,
      deadline: l.deadline,
    }));
    return allDevices.filter(ld => !abandonedLeases.includes(ld.hostname));
  }

  private async refreshOnEarliestDeadline(
    devicesPromise: Promise<LeasedDevice[]>
  ): Promise<void> {
    const devices = await devicesPromise;

    // Return if devicesPromise was already invalidated.
    if (this.cachedDevices !== devicesPromise) {
      return;
    }

    // Find the earliest deadline.
    const deadlines = devices
      .map(device => device.deadline)
      .filter((deadline): deadline is Date => deadline !== undefined);
    deadlines.sort(dateFns.compareAsc);
    if (deadlines.length === 0) {
      return;
    }
    const earliestDeadline = deadlines[0];

    // Schedule a refresh() call.
    const timeoutId = setTimeout(() => {
      // Return if devicesPromise was already invalidated.
      if (this.cachedDevices !== devicesPromise) {
        return;
      }
      this.refresh();
    }, dateFns.differenceInMilliseconds(earliestDeadline, new Date()));

    // Store a Disposable so that the scheduled task can be canceled on
    // refresh() or dispose().
    // Note that this.refreshTimer is always undefined at this point because
    // this.refreshTimer is set at most only once for a this.cachedDevices.
    this.refreshTimer = new vscode.Disposable(() => {
      clearTimeout(timeoutId);
    });
  }
}

/**
 * Provides a merged view of OwnedDeviceRepository and LeasedDeviceRepository.
 * It is still possible to access child device repositories via read-only fields.
 */
export class DeviceRepository {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidChangeEmitter,
  ];

  readonly owned: OwnedDeviceRepository;
  readonly leased: LeasedDeviceRepository;

  constructor(
    crosfleetRunner: crosfleet.CrosfleetRunner,
    abandonedDevices: abandonedDevices.AbandonedDevices
  ) {
    this.owned = new OwnedDeviceRepository();
    this.leased = new LeasedDeviceRepository(crosfleetRunner, abandonedDevices);

    this.subscriptions.push(this.owned, this.leased);

    this.subscriptions.push(
      this.owned.onDidChange(() => {
        this.onDidChangeEmitter.fire();
      }),
      this.leased.onDidChange(() => {
        this.onDidChangeEmitter.fire();
      })
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  async getDevices(): Promise<(OwnedDevice | LeasedDevice)[]> {
    const ownedDevices = this.owned.getDevices();
    const leasedDevices = await this.leased.getDevices();
    return [...ownedDevices, ...leasedDevices];
  }
}
