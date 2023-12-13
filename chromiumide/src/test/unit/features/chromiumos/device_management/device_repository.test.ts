// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as abandonedDevices from '../../../../../features/device_management/abandoned_devices';
import * as crosfleet from '../../../../../features/device_management/crosfleet';
import * as repository from '../../../../../features/device_management/device_repository';
import * as config from '../../../../../services/config';
import * as testing from '../../../../testing';
import * as fakes from '../../../../testing/fakes';

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
  const clock = jasmine.clock();
  beforeEach(() => {
    clock.install();
    clock.mockDate(new Date('2000-01-01T00:00:00Z'));
  });
  afterEach(() => {
    clock.uninstall();
  });

  const {fakeExec} = testing.installFakeExec();
  const cipdRepository = fakes.installFakeCipd(fakeExec);
  const fakeCrosfleet = fakes.installFakeCrosfleet(fakeExec, cipdRepository);

  const state = testing.cleanState(() => {
    const abandonedDuts = new abandonedDevices.AbandonedDevices(
      new fakes.Memento()
    );
    const leasedDeviceRepository = new repository.LeasedDeviceRepository(
      new crosfleet.CrosfleetRunner(
        cipdRepository,
        new fakes.VoidOutputChannel()
      ),
      abandonedDuts
    );
    return {
      abandonedDevices: abandonedDuts,
      leasedDeviceRepository,
    };
  });

  afterEach(() => {
    state.leasedDeviceRepository.dispose();
  });

  it('returns list of devices', async () => {
    // getDevices initially returns an empty list.
    expect(await state.leasedDeviceRepository.getDevices()).toEqual([]);

    // Set fake leases.
    fakeCrosfleet.setLeases([
      {
        hostname: 'cros333',
        board: 'board3',
        model: 'model3',
        deadline: new Date('2000-01-01T00:03:00Z'),
      },
      {
        hostname: 'cros444',
        board: 'board4',
        model: 'model4',
        deadline: new Date('2000-01-01T00:04:00Z'),
      },
    ]);

    // getDevices still returns an empty list since it's cached.
    expect(await state.leasedDeviceRepository.getDevices()).toEqual([]);

    // Request to clear the cache.
    state.leasedDeviceRepository.refresh();

    // getDevices returns two devices.
    expect(await state.leasedDeviceRepository.getDevices()).toEqual([
      {
        category: repository.DeviceCategory.LEASED,
        hostname: 'cros333',
        board: 'board3',
        model: 'model3',
        deadline: new Date('2000-01-01T00:03:00Z'),
      },
      {
        category: repository.DeviceCategory.LEASED,
        hostname: 'cros444',
        board: 'board4',
        model: 'model4',
        deadline: new Date('2000-01-01T00:04:00Z'),
      },
    ]);
  });

  it('skips devices that were abandoned', async () => {
    // Set fake leases.
    fakeCrosfleet.setLeases([
      {
        hostname: 'cros333',
        board: 'board3',
        model: 'model3',
        deadline: new Date('2000-01-01T00:03:00Z'),
      },
      {
        hostname: 'cros444',
        board: 'board4',
        model: 'model4',
        deadline: new Date('2000-01-01T00:04:00Z'),
      },
    ]);

    await state.abandonedDevices.insert('cros333');
    await state.abandonedDevices.insert('cros555');

    state.leasedDeviceRepository.refresh();

    // getDevices returns two devices.
    expect(await state.leasedDeviceRepository.getDevices()).toEqual([
      {
        category: repository.DeviceCategory.LEASED,
        hostname: 'cros444',
        board: 'board4',
        model: 'model4',
        deadline: new Date('2000-01-01T00:04:00Z'),
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

  it('refreshes on the earliest deadline', async () => {
    // Set fake leases.
    fakeCrosfleet.setLeases([
      {
        hostname: 'cros444',
        board: 'board4',
        model: 'model4',
        deadline: new Date('2000-01-01T00:04:00Z'), // 4 minutes later
      },
      {
        hostname: 'cros333',
        board: 'board3',
        model: 'model3',
        deadline: new Date('2000-01-01T00:03:00Z'), // 3 minutes later
      },
    ]);

    // Get the device list once to schedule a refresh.
    expect(await state.leasedDeviceRepository.getDevices()).toEqual([
      {
        category: repository.DeviceCategory.LEASED,
        hostname: 'cros444',
        board: 'board4',
        model: 'model4',
        deadline: new Date('2000-01-01T00:04:00Z'),
      },
      {
        category: repository.DeviceCategory.LEASED,
        hostname: 'cros333',
        board: 'board3',
        model: 'model3',
        deadline: new Date('2000-01-01T00:03:00Z'),
      },
    ]);

    // Subscribe to changes before advancing the clock.
    const didChange = new Promise<void>(resolve => {
      const subscription = state.leasedDeviceRepository.onDidChange(() => {
        subscription.dispose();
        resolve();
      });
    });

    // Advance the clock, which should trigger a refresh.
    clock.tick(210 * 1000); // 3m30s

    // Ensure that onDidChange event fired.
    await didChange;

    // Expired leases don't appear.
    expect(await state.leasedDeviceRepository.getDevices()).toEqual([
      {
        category: repository.DeviceCategory.LEASED,
        hostname: 'cros444',
        board: 'board4',
        model: 'model4',
        deadline: new Date('2000-01-01T00:04:00Z'),
      },
    ]);
  });
});

describe('Device repository', () => {
  const clock = jasmine.clock();
  beforeEach(() => {
    clock.install();
    clock.mockDate(new Date('2000-01-01T00:00:00Z'));
  });
  afterEach(() => {
    clock.uninstall();
  });

  const {fakeExec} = testing.installFakeExec();
  const cipdRepository = fakes.installFakeCipd(fakeExec);
  const fakeCrosfleet = fakes.installFakeCrosfleet(fakeExec, cipdRepository);

  const state = testing.cleanState(() => {
    const deviceRepository = new repository.DeviceRepository(
      new crosfleet.CrosfleetRunner(
        cipdRepository,
        new fakes.VoidOutputChannel()
      ),
      new abandonedDevices.AbandonedDevices(new fakes.Memento())
    );
    return {
      deviceRepository,
    };
  });

  afterEach(() => {
    state.deviceRepository.dispose();
  });

  it('returns list of devices', async () => {
    // getDevices initially returns an empty list.
    expect(await state.deviceRepository.getDevices()).toEqual([]);

    // Add two owned devices.
    await state.deviceRepository.owned.addDevice('localhost:1111');
    await state.deviceRepository.owned.addDevice('localhost:2222');

    // Set fake leases.
    fakeCrosfleet.setLeases([
      {
        hostname: 'cros333',
        board: 'board3',
        model: 'model3',
        deadline: new Date('2000-01-01T00:03:00Z'),
      },
      {
        hostname: 'cros444',
        board: 'board4',
        model: 'model4',
        deadline: new Date('2000-01-01T00:04:00Z'),
      },
    ]);

    // getDevices returns owned devices, but not leased devices because it is
    // cached.
    expect(await state.deviceRepository.getDevices()).toEqual([
      {
        category: repository.DeviceCategory.OWNED,
        hostname: 'localhost:1111',
      },
      {
        category: repository.DeviceCategory.OWNED,
        hostname: 'localhost:2222',
      },
    ]);

    // Request to clear the cache.
    state.deviceRepository.leased.refresh();

    // getDevices returns all devices.
    expect(await state.deviceRepository.getDevices()).toEqual([
      {
        category: repository.DeviceCategory.OWNED,
        hostname: 'localhost:1111',
      },
      {
        category: repository.DeviceCategory.OWNED,
        hostname: 'localhost:2222',
      },
      {
        category: repository.DeviceCategory.LEASED,
        hostname: 'cros333',
        board: 'board3',
        model: 'model3',
        deadline: new Date('2000-01-01T00:03:00Z'),
      },
      {
        category: repository.DeviceCategory.LEASED,
        hostname: 'cros444',
        board: 'board4',
        model: 'model4',
        deadline: new Date('2000-01-01T00:04:00Z'),
      },
    ]);
  });

  it('notifies on owned device updates', async () => {
    // Subscribe to changes before updating devices.
    const didChange = new Promise<void>(resolve => {
      const subscription = state.deviceRepository.onDidChange(() => {
        subscription.dispose();
        resolve();
      });
    });

    // Add a device.
    await state.deviceRepository.owned.addDevice('localhost:1111');

    // Ensure that onDidChange event fired.
    await didChange;
  });

  it('notifies on leased device refresh requests', async () => {
    // Subscribe to changes before updating devices.
    const didChange = new Promise<void>(resolve => {
      const subscription = state.deviceRepository.onDidChange(() => {
        subscription.dispose();
        resolve();
      });
    });

    // Request refresh.
    state.deviceRepository.leased.refresh();

    // Ensure that onDidChange event fired.
    await didChange;
  });
});
