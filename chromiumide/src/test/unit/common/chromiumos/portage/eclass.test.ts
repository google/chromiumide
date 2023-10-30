// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as eclass from '../../../../../common/chromiumos/portage/eclass';
import * as testing from '../../../../testing';

describe('Eclass path finder', () => {
  const tempDir = testing.tempDir();
  const eclassFiles = {
    'src/third_party/chromiumos-overlay/eclass/cros-debug.eclass': 'cros-debug',
    'src/third_party/eclass-overlay/eclass/cros-constants.eclass':
      'cros-constants',
    'src/third_party/portage-stable/eclass/kernel.eclass': 'kernel',
  };
  it('finds eclasses', async () => {
    const chromiumosRoot = tempDir.path;
    await testing.putFiles(chromiumosRoot, eclassFiles);

    for (const [eclassPath, eclassName] of Object.entries(eclassFiles)) {
      const got = eclass.findEclassFilePath(eclassName, chromiumosRoot);
      expect(got).toEqual(path.join(chromiumosRoot, eclassPath));
    }

    const got = eclass.findEclassFilePath('does-not-exist', chromiumosRoot);
    expect(got).toEqual(undefined);
  });
});
