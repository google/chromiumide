// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {getDriver} from '../../../../shared/app/common/driver_repository';
import {
  CROS_IMAGE_VERSION_RE_SRC,
  getChromeMilestones,
  parseFullCrosVersion,
} from '../../../common/image_version';
import * as testing from '../../testing';
import * as fakes from '../../testing/fakes';

const driver = getDriver();

describe('Match CrOS version with', () => {
  const versionRe = new RegExp(`^(${CROS_IMAGE_VERSION_RE_SRC})$`);

  it('release version string', () => {
    const release_image_version = 'R120-15661.0.0';
    const match = versionRe.exec(release_image_version);
    expect(match![1]).toEqual(release_image_version);
    expect(parseFullCrosVersion(match![1])).toEqual({
      chromeMilestone: 120,
      chromeOsMajor: 15661,
      chromeOsMinor: 0,
      chromeOsPatch: 0,
      snapshotId: undefined,
      buildId: undefined,
    });
  });

  it('postsubmit version string', () => {
    const postsubmit_image_version = 'R123-15758.0.0-61547-8757885692586480689';
    const match = versionRe.exec(postsubmit_image_version);
    expect(match![1]).toEqual(postsubmit_image_version);
    expect(parseFullCrosVersion(match![1])).toEqual({
      chromeMilestone: 123,
      chromeOsMajor: 15758,
      chromeOsMinor: 0,
      chromeOsPatch: 0,
      snapshotId: '61547',
      buildId: '8757885692586480689',
    });
  });
  it('non-image-version string', () => {
    const non_image_version = 'foo';
    expect(versionRe.exec(non_image_version)).toEqual(null);
  });
});

describe('Get chrome milestones', () => {
  const fakeExec = testing.installFakeExec();
  fakes.installFakeSudo(fakeExec);
  const tempDir = testing.tempDir();

  it('successfully', async () => {
    await testing.buildFakeChromeos(tempDir.path);

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

    const milestones = await getChromeMilestones(async () => FAKE_STDOUT);
    expect(milestones).toEqual([104, 103, 102, 101, 100]);
  });

  it('report error when failed to get ChromiumOS manifest', async () => {
    spyOn(driver.metrics, 'send' as never);
    const milestones = await getChromeMilestones(async () => {
      throw new Error(
        'GET https://chromium.googlesource.com/chromiumos/manifest/+refs?format=TEXT: status code: 404: body'
      );
    });
    expect(milestones).toEqual([]);
    expect(driver.metrics.send).toHaveBeenCalledOnceWith({
      category: 'error',
      group: 'device',
      name: 'device_management_fetch_manifest_refs_error',
      description:
        'GET https://chromium.googlesource.com/chromiumos/manifest/+refs?format=TEXT: status code: 404: body',
    });
  });
});
