// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as semver from 'semver';
import * as checkUpdates from '../../check_updates';
import {installVscodeDouble} from './doubles';

describe('Check update', () => {
  const {vscodeSpy} = installVscodeDouble();

  it('returns if dismissed', async () => {
    vscodeSpy.window.showInformationMessage
      .withArgs(
        'New version of CrOS IDE is available (installed: 0.0.1, available: 0.0.2).',
        'Install',
        'Dismiss'
      )
      .and.returnValue(Promise.resolve('Dismiss'));
    await checkUpdates.showInstallPrompt(
      /* installed = */ new semver.SemVer('0.0.1'),
      /* available = */ new semver.SemVer('0.0.2'),
      'path/to/gsutil'
    );

    // TODO(oka): test install is not called, removing this line.
    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalled();
  });

  // TODO(oka): test install.
});
