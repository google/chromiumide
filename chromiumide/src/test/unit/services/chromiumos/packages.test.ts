// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import {Source} from '../../../../common/common_util';
import * as services from '../../../../services';
import {Packages} from '../../../../services/chromiumos';
import {Mapping} from '../../../../services/chromiumos/packages/mapping';
import * as testing from '../../../testing';

describe('Packages', () => {
  const tempDir = testing.tempDir();

  it('returns package information', async () => {
    await testing.buildFakeChroot(tempDir.path);

    const packages = Packages.getOrCreate(
      services.chromiumos.ChrootService.maybeCreate(tempDir.path, false)!
    );
    // A file should exists in the filepath to get its absolute path.
    await testing.putFiles(tempDir.path, {
      'src/platform2/foo/foo.cc': 'x',
      'src/third_party/chromiumos-overlay/chromeos-base/foo/foo-9999.ebuild': `inherit platform
PLATFORM_SUBDIR="foo"
`,
      'src/platform2/camera/common/foo.cc': 'x',
      'src/platform2/camera/features/foo.cc': 'x',
      'src/platform2/camera/gpu/foo.cc': 'x',
      'src/third_party/chromiumos-overlay/chromeos-base/cros-camera-libs/cros-camera-libs-9999.ebuild': `inherit platform
PLATFORM_SUBDIR="camera/common"
`,
      'src/platform2/unknown_dir/foo.cc': 'x',
    });

    expect(
      await packages.fromFilepath(
        path.join(tempDir.path, 'src/platform2/foo/foo.cc')
      )
    ).toEqual({
      sourceDir: 'src/platform2/foo',
      pkg: {
        category: 'chromeos-base',
        name: 'foo',
      },
    });

    for (const name of ['common', 'features', 'gpu']) {
      expect(
        await packages.fromFilepath(
          path.join(tempDir.path, `src/platform2/camera/${name}/foo.cc`)
        )
      ).toEqual({
        sourceDir: `src/platform2/camera/${name}`,
        pkg: {
          category: 'chromeos-base',
          name: 'cros-camera-libs',
        },
      });
    }

    expect(
      await packages.fromFilepath(
        path.join(tempDir.path, 'src/platform2/unknown_dir/foo.cc')
      )
    ).toBeNull();

    expect(
      await packages.fromFilepath(path.join(tempDir.path, 'not_exist'))
    ).toBeNull();
  });

  it('fromFilepath can be called concurrently', async () => {
    await testing.buildFakeChroot(tempDir.path);

    const fooPackageInfo = {
      sourceDir: 'foo',
      pkg: {category: 'chromeos-base', name: 'foo'},
    };

    const blocker = await testing.BlockingPromise.new(undefined);

    spyOn(Mapping, 'generate').and.callFake(async () => {
      await blocker.promise;

      return [fooPackageInfo];
    });

    const packages = Packages.getOrCreate(
      services.chromiumos.ChrootService.maybeCreate(
        tempDir.path,
        /* setContext = */ false
      )!
    );

    const promises = Promise.all([
      packages.fromFilepath(path.join(tempDir.path, 'foo')),
      packages.fromFilepath(path.join(tempDir.path, 'foo')),
    ]);

    blocker.unblock();

    expect(await promises).toEqual([fooPackageInfo, fooPackageInfo]);

    expect(Mapping.generate).toHaveBeenCalledOnceWith(tempDir.path as Source);
  });
});
