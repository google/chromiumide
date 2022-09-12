// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Contains leases that we abandoned.
 *
 * This class solves the problem that `crosfleet dut abandon` is asynchronous:
 * it schedules returning a devices, but a returned device will still
 * be listed as leased for some time.
 */
// TODO(ttylenda): persist the data when CrOS IDE restarts
export class AbandonedDevices {
  private readonly devices: string[] = [];

  constructor() {}

  insert(hostname: string) {
    this.devices.push(hostname);
  }

  fetch(): string[] {
    return [...this.devices];
  }
}
