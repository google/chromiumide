// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as mockFs from 'mock-fs';
import * as chromiumos from '../../../../../services/watchers/product/chromiumos';

describe('Chromiumos product detection', () => {
  afterEach(() => {
    mockFs.restore();
  });

  // Tests for regular manifests exists in watcher.test.ts.
  it('should check well-known files for irregular manifests', async () => {
    mockFs({
      '/cros/.repo/manifests.git/config': 'irregular manifest',
      // Well-known files exist.
      '/cros/chromite': {},
      '/cros/src/platform2': {},
    });

    await expectAsync(chromiumos.root('/cros')).toBeResolvedTo('/cros');
    await expectAsync(chromiumos.root('/cros/foo/bar')).toBeResolvedTo('/cros');
  });

  it('should fail for missing well-known files and irregular manifests', async () => {
    mockFs({
      '/cros/.repo/manifests.git/config': 'irregular manifest',
    });

    await expectAsync(chromiumos.root('/cros')).toBeResolvedTo(undefined);
  });
});
