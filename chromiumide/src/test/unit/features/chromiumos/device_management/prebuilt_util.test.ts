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

  it('get chrome milestones', async () => {
    await testing.buildFakeChroot(tempDir.path);

    // Shortened from real example.
    const FAKE_STDOUT = `79c960cd2d079c492fbefa9ce767cdb3dff1cf4a refs/heads/green
9a178cc34aae394ef825b60af9685aa28a3adcac refs/heads/infra/config
9cd6d512999c86125d17047d977374e2eb2563e3 refs/heads/main
c96b6ee19619d37fdfe0c515ef7cd1a0c4e0aee0 refs/heads/postsubmit
7564d29700eccdb98498b02979e751b03c8fdbed refs/heads/release-1011.B
bb6cc6b2c49bf1dd2b6fa555dd7c3ceeae5f3e9a refs/heads/release-R100-14526.B
009988d7ff8cc856cf0d222dd18f780909137cd7 refs/heads/release-R101-14588.B
b0ee9ee31ad2ab1c979826539473d0d45a7658ea refs/heads/release-R102-14695.B
50f39b205c194e24db3d235dfb890bf128756ea9 refs/heads/release-R103-14816.B
528d53f9afa0f35626487af15914a849eaf3f5be refs/heads/snapshot
ebe6b5780790c9ecfd48dc27deec694f1f831e76 refs/heads/stabilize
bcbb260575b8ad07f82e3f748e671a9adfcbfd71 refs/heads/stabilize-10032.111.B
8a6f800ee156a7388599a321e8454b7c6576e70a refs/heads/stabilize-10032.56.B
`;

    const milestones = await prebuiltUtil.getChromeMilestones(
      async () => FAKE_STDOUT
    );
    expect(milestones).toEqual([103, 102, 101, 100]);
  });
});
