// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as metricsUtil from '../../../features/metrics/metrics_util';
import * as testing from '../../testing';

describe('Metrics util: user id', () => {
  const tempDir = testing.tempDir();

  it('initializes and read id', async () => {
    const testUid = 'testing-uid';
    // File containing user ID not found, should create a new one containing testUid.
    const uidCreated = await metricsUtil.readOrCreateUserId(
      tempDir.path,
      async () => testUid
    );
    assert.strictEqual(uidCreated, testUid);

    // Verify it retrieves testUid successfully and not attempting to create a new one.
    const uidRead = await metricsUtil.readOrCreateUserId(
      tempDir.path,
      async () => {
        throw new Error(
          'Unexpected call to create user id (valid id should have been created).'
        );
      }
    );
    assert.strictEqual(uidRead, testUid);
  });

  it('resets invalid id', async () => {
    const testUidInvalid = 'testing-uid-invalid';
    const testUidNew = 'testing-uid-new';
    // Create user ID with invalid format, i.e. only a string which stands for ID and not a json.
    const configPathFull = path.join(tempDir.path, metricsUtil.getConfigPath());
    await fs.promises.mkdir(path.dirname(configPathFull), {recursive: true});
    await fs.promises.writeFile(configPathFull, testUidInvalid);

    // Verify that a new user ID replaces the invalid one.
    const uidRead = await metricsUtil.readOrCreateUserId(
      tempDir.path,
      async () => testUidNew
    );
    assert.strictEqual(uidRead, testUidNew);
  });

  it('resets expired id', async () => {
    const testUidExpired = 'testing-uid-expired';
    const testUidNew = 'testing-uid-new';
    const expiredCreateDate = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
    // Create user ID with an expired-by-one-day create date.
    const uidCreated = await metricsUtil.resetUserId(
      tempDir.path,
      async () => testUidExpired,
      expiredCreateDate
    );
    assert.strictEqual(uidCreated, testUidExpired);

    // Verify that a new user ID replaces the expired one.
    const uidRead = await metricsUtil.readOrCreateUserId(
      tempDir.path,
      async () => testUidNew
    );
    assert.strictEqual(uidRead, testUidNew);
  });

  it('determine user is external when failing to reach URL', async () => {
    const fake_url =
      'https://cit-cli-metrics.appspot.com/should-upload/does_not_exist';
    assert.strictEqual(await metricsUtil.isGoogler(fake_url), false);
  });
});

describe('Metrics util: get git repo name', () => {
  const tempDir = testing.tempDir();

  it('path with prefix /home/<username>/chromiumos/', async () => {
    await testing.putFiles(tempDir.path, {
      '/home/foo/chromiumos/src/platform2/.git/HEAD': '',
      '/home/foo/chromiumos/src/platform2/bar/baz.cc': '',
    });

    assert.strictEqual(
      metricsUtil.getGitRepoName(
        `${tempDir.path}/home/foo/chromiumos/src/platform2/bar/baz.cc`
      ),
      'src/platform2'
    );
  });

  it('path with prefix /mnt/host/source/', async () => {
    await testing.putFiles(tempDir.path, {
      '/mnt/host/source/src/platform2/.git/HEAD': '',
      '/mnt/host/source/src/platform2/bar/baz.cc': '',
    });

    assert.strictEqual(
      metricsUtil.getGitRepoName(
        `${tempDir.path}/mnt/host/source/src/platform2/bar/baz.cc`
      ),
      'src/platform2'
    );
  });

  it('invalid path', async () => {
    // Do not create .git/ directory anywhere.
    await testing.putFiles(tempDir.path, {
      '/mnt/host/source/src/platform2/bar/baz.cc': '',
    });

    assert.strictEqual(
      metricsUtil.getGitRepoName(
        `${tempDir.path}/mnt/host/source/src/platform2/bar/baz.cc`
      ),
      undefined
    );
  });
});
