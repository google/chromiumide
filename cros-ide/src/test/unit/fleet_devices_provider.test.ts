// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as commonUtil from '../../common/common_util';
import * as fleetProvider from '../../dut_management/services/fleet_devices_provider';
import {exactMatch, FakeExec} from '../testing';

suite('Fleet Devices Provider', () => {
  test('No leases', async () => {
    const fakeExec = new FakeExec().on(
        'crosfleet',
        exactMatch(['dut', 'leases', '-json'], async () => {
          return '{}\n';
        }));
    const cleanUpExec = commonUtil.setExecForTesting(fakeExec.exec.bind(fakeExec));
    try {
      const provider = new fleetProvider.FleetDevicesProvider();
      await provider.updateCache();
    } finally {
      cleanUpExec();
    }
  });

  // TODO: also test with non-empty data
});
