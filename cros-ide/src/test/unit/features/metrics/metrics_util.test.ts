// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as metricsUtil from '../../../../features/metrics/metrics_util';
import * as testing from '../../../testing';

describe('Metrics util: get git repo name', () => {
  const tempDir = testing.tempDir();

  it('path with prefix /home/<username>/chromiumos/', async () => {
    await testing.putFiles(tempDir.path, {
      'src/platform2/.git/HEAD': '',
      'src/platform2/bar/baz.cc': '',
    });

    assert.strictEqual(
      metricsUtil.getGitRepoName(
        `${tempDir.path}/src/platform2/bar/baz.cc`,
        tempDir.path
      ),
      'src/platform2'
    );
  });

  it('path with prefix /mnt/host/source/', async () => {
    await testing.putFiles(tempDir.path, {
      'src/platform2/.git/HEAD': '',
      'src/platform2/bar/baz.cc': '',
    });

    assert.strictEqual(
      metricsUtil.getGitRepoName(
        `${tempDir.path}/src/platform2/bar/baz.cc`,
        tempDir.path
      ),
      'src/platform2'
    );
  });

  it('invalid path', async () => {
    // Do not create .git/ directory anywhere.
    await testing.putFiles(tempDir.path, {
      'src/platform2/bar/baz.cc': '',
    });

    assert.strictEqual(
      metricsUtil.getGitRepoName(
        `${tempDir.path}/src/platform2/bar/baz.cc`,
        tempDir.path
      ),
      undefined
    );
  });
});
