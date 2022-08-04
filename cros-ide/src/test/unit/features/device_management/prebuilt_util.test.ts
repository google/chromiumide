// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import {WrapFs} from '../../../../common/cros';
import * as prebuiltUtil from '../../../../features/device_management/prebuilt_util';
import * as commonUtil from '../../../../common/common_util';
import * as chroot from '../../../../services/chroot';
import * as testing from '../../../testing';
import * as fakes from '../../../testing/fakes';

describe('Prebuilt utilities', () => {
  const {fakeExec} = testing.installFakeExec();
  fakes.installFakeSudo(fakeExec);
  const tempDir = testing.tempDir();

  it('list available images', async () => {
    const FAKE_STDOUT = `gs://chromeos-image-archive/xyz-release/R100-10000.0.0/
gs://chromeos-image-archive/xyz-release/R100-10001.0.0/
gs://chromeos-image-archive/xyz-release/R101-10100.0.0/
gs://chromeos-image-archive/xyz-release/R101-10101.0.0/
gs://chromeos-image-archive/xyz-release/R99-9900.0.0/
gs://chromeos-image-archive/xyz-release/R99-9901.0.0/
gs://chromeos-image-archive/xyz-release/garbage.txt
`;

    fakeExec.on(
      path.join(tempDir.path, 'chromite/bin/cros_sdk'),
      testing.exactMatch(
        ['--', 'gsutil', 'ls', 'gs://chromeos-image-archive/xyz-release/'],
        async () => FAKE_STDOUT
      )
    );

    const versions = await prebuiltUtil.listPrebuiltVersions(
      'xyz',
      new chroot.ChrootService(
        undefined,
        new WrapFs(tempDir.path as commonUtil.Source),
        () => false
      ),
      new fakes.VoidOutputChannel()
    );
    expect(versions).toEqual([
      'R101-10101.0.0',
      'R101-10100.0.0',
      'R100-10001.0.0',
      'R100-10000.0.0',
      'R99-9901.0.0',
      'R99-9900.0.0',
    ]);
  });
});
