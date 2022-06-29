// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as crosfleet from '../../../../features/device_management/crosfleet';
import * as repository from '../../../../features/device_management/device_repository';
import * as config from '../../../../services/config';
import * as testing from '../../../testing';
import * as fakes from '../../../testing/fakes';

describe('Owned device repository', () => {
  beforeEach(async () => {
    // Initialize devices to an empty list.
    await config.deviceManagement.devices.update([]);
  });

  const state = testing.cleanState(() => ({
    ownedDeviceRepository: new repository.OwnedDeviceRepository(),
  }));

  afterEach(() => {
    state.ownedDeviceRepository.dispose();
  });

  it('handles configuration updates', async () => {
    // getDevices initially returns an empty list.
    expect(state.ownedDeviceRepository.getDevices()).toEqual([]);

    // Add two devices.
    await state.ownedDeviceRepository.addDevice('localhost:1111');
    await state.ownedDeviceRepository.addDevice('localhost:2222');

    // getDevices returns two devices.
    expect(state.ownedDeviceRepository.getDevices()).toEqual([
      {
        category: repository.DeviceCategory.OWNED,
        hostname: 'localhost:1111',
      },
      {
        category: repository.DeviceCategory.OWNED,
        hostname: 'localhost:2222',
      },
    ]);

    // Remove a device.
    await state.ownedDeviceRepository.removeDevice('localhost:1111');

    // getDevices returns one device.
    expect(state.ownedDeviceRepository.getDevices()).toEqual([
      {
        category: repository.DeviceCategory.OWNED,
        hostname: 'localhost:2222',
      },
    ]);
  });

  it('notifies configuration updates', async () => {
    // Subscribe to changes before updating devices.
    const didChange = new Promise<void>(resolve => {
      const subscription = state.ownedDeviceRepository.onDidChange(() => {
        subscription.dispose();
        resolve();
      });
    });

    // Add a device.
    await state.ownedDeviceRepository.addDevice('localhost:1111');

    // Ensure that onDidChange event fired.
    await didChange;
  });
});

describe('Leased device repository', () => {
  const {fakeExec} = testing.installFakeExec();
  const cipdRepository = fakes.installFakeCipd(fakeExec);
  const fakeCrosfleet = fakes.installFakeCrosfleet(fakeExec, cipdRepository);

  const state = testing.cleanState(() => {
    const leasedDeviceRepository = new repository.LeasedDeviceRepository(
      new crosfleet.CrosfleetRunner(
        cipdRepository,
        new fakes.VoidOutputChannel()
      )
    );
    return {
      leasedDeviceRepository,
    };
  });

  afterEach(() => {
    state.leasedDeviceRepository.dispose();
  });

  // TODO(b/237357253): Reenable the test.
  // Likely failing due to experimental feature settings.
  xit('returns list of devices', async () => {
    // getDevices initially returns an empty list.
    expect(await state.leasedDeviceRepository.getDevices()).toEqual([]);

    // Set fake leases.
    fakeCrosfleet.setLeases([
      {hostname: 'cros333', board: 'board3', model: 'model3'},
      {hostname: 'cros444', board: 'board4', model: 'model4'},
    ]);

    // getDevices returns two devices.
    expect(await state.leasedDeviceRepository.getDevices()).toEqual([
      {
        category: repository.DeviceCategory.LEASED,
        hostname: 'cros333',
        board: 'board3',
        model: 'model3',
      },
      {
        category: repository.DeviceCategory.LEASED,
        hostname: 'cros444',
        board: 'board4',
        model: 'model4',
      },
    ]);
  });

  it('returns empty list when the user is logged out', async () => {
    // Simulate logout.
    fakeCrosfleet.setLoggedIn(false);

    // getDevices does not throw errors.
    expect(await state.leasedDeviceRepository.getDevices()).toEqual([]);
  });

  it('notifies on explicit refresh request', async () => {
    // Subscribe to changes before updating devices.
    const didChange = new Promise<void>(resolve => {
      const subscription = state.leasedDeviceRepository.onDidChange(() => {
        subscription.dispose();
        resolve();
      });
    });

    // Request refresh.
    state.leasedDeviceRepository.refresh();

    // Ensure that onDidChange event fired.
    await didChange;
  });
});
