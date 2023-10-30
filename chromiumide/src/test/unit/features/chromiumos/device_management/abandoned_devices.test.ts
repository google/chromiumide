// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  AbandonedDevices,
  TEST_ONLY,
} from '../../../../../features/device_management/abandoned_devices';
import {cleanState} from '../../../../testing';
import * as fakes from '../../../../testing/fakes';

const {GLOBAL_STATE_KEY} = TEST_ONLY;

describe('Abandoned devices', () => {
  const state = cleanState(async () => {
    return {
      globalState: new fakes.Memento(),
    };
  });

  it('are retrieved from global state', async () => {
    // GlobalState could be used for other purposes,
    // so make sure it doesn't cause errors.
    await state.globalState.update('key-1', 'value-1');

    const ad1 = new AbandonedDevices(state.globalState);

    // Save some hosts.
    await ad1.insert('host-1');
    await ad1.insert('host-2');

    // Then retrieve them.
    const ad2 = new AbandonedDevices(state.globalState);

    expect(await ad2.fetch()).toEqual(
      jasmine.arrayWithExactContents(['host-1', 'host-2'])
    );
    expect(state.globalState.get('key-1')).toEqual('value-1');
  });

  it('are cleared from global state after a delay', async () => {
    await state.globalState.update('key-1', 'value-1');

    const hostRecent = 'host-recent';
    const hostStale = 'host-stale';

    jasmine.clock().install().mockDate();

    const ad = new AbandonedDevices(state.globalState);

    await ad.insert(hostStale);
    jasmine.clock().tick(1000 * 60 * 60); // one hour

    await ad.insert(hostRecent);
    jasmine.clock().tick(1000 * 10); // ten seconds

    expect(await ad.fetch()).toEqual([hostRecent]);

    jasmine.clock().uninstall();
  });

  it('tolerate incompatible global state', async () => {
    await state.globalState.update(GLOBAL_STATE_KEY, 'incompatible string');

    const ad = new AbandonedDevices(state.globalState);

    expect(await ad.fetch()).toEqual([]);
  });

  it('tolerate incompatible values in global state', async () => {
    await state.globalState.update(GLOBAL_STATE_KEY, [
      ['hostname', Date.now()],
      [true, false],
    ]);

    const ad = new AbandonedDevices(state.globalState);

    expect(await ad.fetch()).toEqual(['hostname']);
  });
});
