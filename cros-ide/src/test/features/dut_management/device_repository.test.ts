// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as repository from '../../../features/dut_management/device_repository';
import * as testing from '../../testing';
import * as repositoryUtil from './device_repository_util';

describe('Static device repository', () => {
  beforeEach(async () => {
    // Initialize hosts to an empty list.
    await repositoryUtil.setStaticHosts([]);
  });

  const state = testing.cleanState(() => ({
    staticDeviceRepository: new repository.StaticDeviceRepository(),
  }));

  afterEach(() => {
    state.staticDeviceRepository.dispose();
  });

  it('handles configuration updates', async () => {
    // getDevices initially returns an empty list.
    expect(state.staticDeviceRepository.getDevices()).toEqual([]);

    // Add two hosts.
    await state.staticDeviceRepository.addHost('localhost:1111');
    await state.staticDeviceRepository.addHost('localhost:2222');

    // getDevices returns two hosts.
    expect(state.staticDeviceRepository.getDevices()).toEqual([
      {
        category: repository.DeviceCategory.STATIC,
        hostname: 'localhost:1111',
      },
      {
        category: repository.DeviceCategory.STATIC,
        hostname: 'localhost:2222',
      },
    ]);

    // Remove a host.
    await state.staticDeviceRepository.removeHost('localhost:1111');

    // getDevices returns one host.
    expect(state.staticDeviceRepository.getDevices()).toEqual([
      {
        category: repository.DeviceCategory.STATIC,
        hostname: 'localhost:2222',
      },
    ]);
  });

  it('notifies configuration updates', async () => {
    // Subscribe to changes before updating hosts.
    const didChange = new Promise<void>(resolve => {
      const subscription = state.staticDeviceRepository.onDidChange(() => {
        subscription.dispose();
        resolve();
      });
    });

    // Add a host.
    await state.staticDeviceRepository.addHost('localhost:1111');

    // Ensure that onDidChange event fired.
    await didChange;
  });
});
