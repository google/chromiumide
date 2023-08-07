// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as depotTools from '../../../common/depot_tools';
import * as config from '../../../services/config';
import * as testing from '../../testing';

describe('depot_tools', () => {
  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  it('adjusts PATH based on settings', async () => {
    await config.paths.depotTools.update('/opt/custom_depot_tools');

    expect(depotTools.envForDepotTools().PATH).toEqual(
      jasmine.stringMatching('^/opt/custom_depot_tools:.*:.*/depot_tools')
    );
  });
  it('adjusts PATH if settings empty', async () => {
    await config.paths.depotTools.update('');

    expect(depotTools.envForDepotTools().PATH).toEqual(
      jasmine.stringMatching('^.*:.*/depot_tools')
    );
  });
});
