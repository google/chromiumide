// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

// Clear hostnames after 5 minutes.
const STORAGE_INTERVAL_MILLIS = 1000 * 60 * 5;

const GLOBAL_STATE_KEY = 'abandoned DUTs';
type DeviceCache = [string, number][];

/**
 * Contains leases that we abandoned.
 *
 * This class solves the problem that `crosfleet dut abandon` is asynchronous:
 * it schedules returning a devices, but a returned device will still
 * be listed as leased for some time.
 *
 * In order to have a good UI experience, we need to remember which devices
 * were returned and persist this data when ChromiumIDE restarts.
 */
export class AbandonedDevices {
  constructor(private readonly globalState: vscode.Memento) {}

  async insert(hostname: string): Promise<void> {
    const cached = this.filterOutExpired(this.safeReadCache());
    const updated = [...cached];
    updated.push([hostname, Date.now()]);
    await this.globalState.update(GLOBAL_STATE_KEY, updated);
  }

  async fetch(): Promise<string[]> {
    const cached = this.safeReadCache();
    const updated = this.filterOutExpired(cached);
    if (updated.length < cached.length) {
      await this.globalState.update(GLOBAL_STATE_KEY, updated);
    }
    return updated.map(hostTime => hostTime[0]);
  }

  /** Remove hosts abandoned more than STORAGE_INTERVAL_MILLIS ago. */
  filterOutExpired(cache: DeviceCache): DeviceCache {
    const cutoff = Date.now() - STORAGE_INTERVAL_MILLIS;
    return cache.filter(hostTime => hostTime[1] > cutoff);
  }

  private safeReadCache(): DeviceCache {
    const cache = this.globalState.get<unknown>(GLOBAL_STATE_KEY, []);
    if (!(cache instanceof Array)) {
      return [];
    }
    return cache.filter(
      elem =>
        elem instanceof Array &&
        elem.length === 2 &&
        typeof elem[0] === 'string' &&
        typeof elem[1] === 'number'
    );
  }
}

export const TEST_ONLY = {
  GLOBAL_STATE_KEY,
};
