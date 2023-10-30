// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  DeviceRepository,
  LeasedDevice,
  OwnedDevice,
  OwnedDeviceRepository,
} from '../../../../../features/device_management/device_repository';

export class FakeOwnedDeviceRepository
  implements Pick<OwnedDeviceRepository, 'getDevices'>
{
  static create(devices: OwnedDevice[]): OwnedDeviceRepository {
    return new this(devices) as unknown as OwnedDeviceRepository;
  }

  private constructor(readonly devices: OwnedDevice[]) {}

  getDevices(): OwnedDevice[] {
    return this.devices;
  }
}

type Device = OwnedDevice | LeasedDevice;

export class FakeDeviceRepository
  implements Pick<DeviceRepository, 'getDevices'>
{
  static create(devices: Device[]): DeviceRepository {
    return new this(devices) as unknown as DeviceRepository;
  }

  private constructor(readonly devices: Device[]) {}

  async getDevices(): Promise<Device[]> {
    return this.devices;
  }
}
