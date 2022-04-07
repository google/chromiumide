// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as commonUtil from '../../common/common_util';
import * as metricsUtil from '../../metrics/metrics_util';

describe('Metrics util', () => {
  it('initializes and read id', async () => {
    const testUid = 'testing-uid';
    await commonUtil.withTempDir(async td => {
      // File containing user ID not found, should create a new one containing testUid.
      const uidCreated = await metricsUtil.readOrCreateUserId(td, async () => testUid);
      assert.strictEqual(uidCreated, testUid);

      // Verify it retrieves testUid successfully and not attempting to create a new one.
      const uidRead = await metricsUtil.readOrCreateUserId(td, async () => {
        throw new Error('Unexpected call to create user id (valid id should have been created).');
      });
      assert.strictEqual(uidRead, testUid);
    });
  });

  it('resets invalid id', async () => {
    const testUidInvalid = 'testing-uid-invalid';
    const testUidNew = 'testing-uid-new';
    await commonUtil.withTempDir(async td => {
      // Create user ID with invalid format, i.e. only a string which stands for ID and not a json.
      const configPathFull = path.join(td, metricsUtil.getConfigPath());
      await fs.promises.mkdir(path.dirname(configPathFull), {recursive: true});
      await fs.promises.writeFile(configPathFull, testUidInvalid);

      // Verify that a new user ID replaces the invalid one.
      const uidRead = await metricsUtil.readOrCreateUserId(td, async () => testUidNew);
      assert.strictEqual(uidRead, testUidNew);
    });
  });

  it('resets expired id', async () => {
    const testUidExpired = 'testing-uid-expired';
    const testUidNew = 'testing-uid-new';
    const expiredCreateDate = new Date(Date.now() - (181 * 24 * 60 * 60 * 1000));
    await commonUtil.withTempDir(async td => {
      // Create user ID with an expired-by-one-day create date.
      const uidCreated = await metricsUtil.resetUserId(td, async () => testUidExpired,
          expiredCreateDate);
      assert.strictEqual(uidCreated, testUidExpired);

      // Verify that a new user ID replaces the expired one.
      const uidRead = await metricsUtil.readOrCreateUserId(td, async () => testUidNew);
      assert.strictEqual(uidRead, testUidNew);
    });
  });
});
