// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as commonUtil from '../../common/common_util';
import * as fleetProvider from '../../dut_management/services/fleet_devices_provider';
import {exactMatch, FakeExec} from '../testing';

describe('Fleet Devices Provider retrieves', () => {
  it('no leases', async () => {
    const fakeExec = new FakeExec().on(
        'crosfleet',
        exactMatch(['dut', 'leases', '-json'], async () => {
          return '{}\n';
        }));
    const cleanUpExec = commonUtil.setExecForTesting(fakeExec.exec.bind(fakeExec));
    try {
      const provider = new fleetProvider.FleetDevicesProvider('');
      await provider.updateCache();
    } finally {
      cleanUpExec();
    }
  });

  // TODO: disabling till we have crosfleet features working
  // it('one lease', async () => {
  // __dirname points to the generated JS code running in out/, but we do not copy test data.
  // so we need to reach to src/ instead.
  // const testDataDir = path.resolve(__dirname, '../../../src/test/testdata/dut_management/');

  //   const leaseJson = path.join(testDataDir, 'eve-lease.json');
  //   const etcLsbRelease = path.join(testDataDir, 'eve-etc_lsb_release.txt');
  //   const fakeExec = new FakeExec()
  //       .on(
  //           'crosfleet',
  //           exactMatch(['dut', 'leases', '-json'], () => {
  //             return fs.promises.readFile(leaseJson, {encoding: 'utf-8'});
  //           }))
  //       .on(
  //           'ssh',
  //           anyMatch(() => {
  //             return fs.promises.readFile(etcLsbRelease, {encoding: 'utf-8'});
  //           }));
  //   const cleanUpExec = commonUtil.setExecForTesting(fakeExec.exec.bind(fakeExec));
  //   try {
  //     const provider = new fleetProvider.FleetDevicesProvider('');
  //     await provider.updateCache();
  //     const children = provider.getChildren();
  //     assert.deepStrictEqual(children, ['chromeos6-row4-rack17-host9.cros']);
  //     const treeItem = provider.getTreeItem('chromeos6-row4-rack17-host9.cros');
  //     assert.strictEqual(treeItem.description, 'eve-release/R99-14469.33.0');
  //   } finally {
  //     cleanUpExec();
  //   }
  // });
});
