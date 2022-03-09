// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as path from 'path';
import * as commonUtil from '../../common/common_util';
import * as cppCodeCompletion from '../../cpp_code_completion';
import * as testing from '../testing';

suite('Code completion', () => {
  test('Get package', async () => {
    await commonUtil.withTempDir(async td => {
      await testing.putFiles(td, {
        '/mnt/host/source/src/platform2/cros-disks/foo.cc': 'x',
        '/mnt/host/source/src/platform2/unknown_dir/foo.cc': 'x',
      });
      assert.deepStrictEqual(await cppCodeCompletion.getPackage(
          path.join(td, '/mnt/host/source/src/platform2/cros-disks/foo.cc'),
          path.join(td, '/mnt/host/source'),
      ), {
        sourceDir: 'src/platform2/cros-disks',
        pkg: 'chromeos-base/cros-disks',
      }, 'success');

      assert.deepStrictEqual(await cppCodeCompletion.getPackage(
          path.join(td, '/mnt/host/source/src/platform2/unknown_dir/foo.cc'),
          path.join(td, '/mnt/host/source'),
      ), null, 'unknown');

      assert.deepStrictEqual(await cppCodeCompletion.getPackage(
          path.join(td, '/mnt/host/source/not_exist'),
          path.join(td, '/mnt/host/source'),
      ), null, 'not exist');
    });
  });

  test('Get user consent', async () => {
    const {
      ALWAYS, NEVER, YES,
      getUserConsent,
    } = cppCodeCompletion.TEST_ONLY;
    type TestCase = {
      name: string,
      current: cppCodeCompletion.UserConsent
      ask: () => Promise<cppCodeCompletion.UserChoice | undefined>,
      want: {
        ok: boolean,
        remember?: cppCodeCompletion.PersistentConsent,
      },
    }
    const testCases: TestCase[] = [
      {
        name: 'Once and always',
        current: 'Once',
        ask: async () => ALWAYS,
        want: {
          ok: true,
          remember: ALWAYS,
        },
      },
      {
        name: 'Once and yes',
        current: 'Once',
        ask: async () => YES,
        want: {
          ok: true,
        },
      },
      {
        name: 'Once and never',
        current: 'Once',
        ask: async () => NEVER,
        want: {
          ok: false,
          remember: NEVER,
        },
      },
      {
        name: 'Once and no answer',
        current: 'Once',
        ask: async () => undefined,
        want: {
          ok: false,
        },
      },
      {
        name: 'Always',
        current: ALWAYS,
        ask: async () => {
          throw new Error('Unexpectedly asked');
        },
        want: {
          ok: true,
        },
      },
      {
        name: 'Never',
        current: NEVER,
        ask: async () => {
          throw new Error('Unexpectedly asked');
        },
        want: {
          ok: false,
        },
      },
    ];
    for (const tc of testCases) {
      assert.deepStrictEqual(await getUserConsent(tc.current, tc.ask), tc.want, tc.name);
    }
  });
});
