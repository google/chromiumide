// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as commonUtil from '../../common/common_util';
import * as cros from '../../common/cros';
import * as testing from '../testing';

async function prepareBoardsDir(td: string) {
  await testing.putFiles(td, {
    '/build/amd64-generic/x': 'x',
    '/build/betty-pi-arc/x': 'x',
    '/build/bin/x': 'x',
    '/build/coral/x': 'x',
  });

  await fs.promises.utimes(path.join(td, '/build/amd64-generic'), 2 /* timestamp */, 2);
  await fs.promises.utimes(path.join(td, '/build/betty-pi-arc'), 1, 1);
  await fs.promises.utimes(path.join(td, '/build/coral'), 3, 3);
}

suite('Cros', () => {
  test('Get worked on boards, most recent first', async () => {
    await commonUtil.withTempDir(async td => {
      await prepareBoardsDir(td);

      assert.deepStrictEqual(await cros.getSetupBoardsRecentFirst(td), [
        'coral',
        'amd64-generic',
        'betty-pi-arc',
      ]);
    });
  });

  test('Get worked on boards in alphabetic order', async () => {
    await commonUtil.withTempDir(async td => {
      await prepareBoardsDir(td);

      assert.deepStrictEqual(await cros.getSetupBoardsAlphabetic(td), [
        'amd64-generic',
        'betty-pi-arc',
        'coral',
      ]);
    });
  });
});
