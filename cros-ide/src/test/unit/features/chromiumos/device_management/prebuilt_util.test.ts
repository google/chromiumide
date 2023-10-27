// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as commonUtil from '../../../../../common/common_util';
import * as prebuiltUtil from '../../../../../features/device_management/prebuilt_util';
import * as services from '../../../../../services';
import * as testing from '../../../../testing';
import * as fakes from '../../../../testing/fakes';

describe('Prebuilt utilities', () => {
  const {fakeExec} = testing.installFakeExec();
  fakes.installFakeSudo(fakeExec);
  const tempDir = testing.tempDir();

  it('list available release images', async () => {
    await testing.buildFakeChroot(tempDir.path);

    const FAKE_STDOUT = `gs://chromeos-image-archive/xyz-release/R100-10000.0.0/image.zip
gs://chromeos-image-archive/xyz-release/R100-10001.0.0/image.zip
gs://chromeos-image-archive/xyz-release/R101-10100.0.0/image.zip
gs://chromeos-image-archive/xyz-release/R101-10101.0.0/image.zip
gs://chromeos-image-archive/xyz-release/R99-9900.0.0/image.zip
gs://chromeos-image-archive/xyz-release/R99-9901.0.0/image.zip
`;

    fakes.installChrootCommandHandler(
      fakeExec,
      tempDir.path as commonUtil.Source,
      'gsutil',
      ['ls', 'gs://chromeos-image-archive/xyz-release/*/image.zip'],
      () => FAKE_STDOUT
    );

    const versions = await prebuiltUtil.listPrebuiltVersions(
      'xyz',
      'release',
      services.chromiumos.ChrootService.maybeCreate(tempDir.path, false)!,
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

  it('list available postsubmit images', async () => {
    await testing.buildFakeChroot(tempDir.path);

    const FAKE_STDOUT = `gs://chromeos-image-archive/xyz-postsubmit/R99-10000.0.0-10001-1000000000000000000/image.zip
gs://chromeos-image-archive/xyz-postsubmit/R100-10000.0.0-10001-1000000000000000005/image.zip
gs://chromeos-image-archive/xyz-postsubmit/R100-10000.0.0-10005-1000000000000000010/image.zip
gs://chromeos-image-archive/xyz-postsubmit/R101-10003.0.0-10010-1000000000000000999/image.zip
gs://chromeos-image-archive/xyz-postsubmit/R102-10010.0.0-10100-1000000000000100000/image.zip
`;

    fakes.installChrootCommandHandler(
      fakeExec,
      tempDir.path as commonUtil.Source,
      'gsutil',
      ['ls', 'gs://chromeos-image-archive/xyz-postsubmit/*/image.zip'],
      () => FAKE_STDOUT
    );

    const versions = await prebuiltUtil.listPrebuiltVersions(
      'xyz',
      'postsubmit',
      services.chromiumos.ChrootService.maybeCreate(tempDir.path, false)!,
      new fakes.VoidOutputChannel()
    );
    expect(versions).toEqual([
      'R102-10010.0.0-10100-1000000000000100000',
      'R101-10003.0.0-10010-1000000000000000999',
      'R100-10000.0.0-10005-1000000000000000010',
      'R100-10000.0.0-10001-1000000000000000005',
      'R99-10000.0.0-10001-1000000000000000000',
    ]);
  });
});
