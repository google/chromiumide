// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as config from '../../../../shared/app/services/config';
import {getPlatform} from '../../../../src/common/platform';
import {installFakeConfigs, installVscodeDouble} from '../../testing';

describe('getPlatform', () => {
  const {vscodeSpy, vscodeEmitters} = installVscodeDouble();
  installFakeConfigs(vscodeSpy, vscodeEmitters);

  it('returns real platform', () => {
    // We don't expect the tests to run on non-linux platforms.
    expect(getPlatform()).toEqual('linux');
  });

  it('returns fake platform if given', async () => {
    await config.chromiumideDevelopment.osPlatform.update('fakeos');
    expect(getPlatform()).toEqual('fakeos');
  });
});
