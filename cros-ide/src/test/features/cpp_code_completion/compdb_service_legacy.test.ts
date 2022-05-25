// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as compdbServiceLegacy from '../../../features/cpp_code_completion/compdb_service_legacy';

describe('Legacy compdb service', () => {
  it('obtains user consent to run commands', async () => {
    const {ALWAYS, NEVER, YES, getUserConsent} = compdbServiceLegacy.TEST_ONLY;
    type TestCase = {
      name: string;
      current: compdbServiceLegacy.UserConsent;
      ask: () => Promise<compdbServiceLegacy.UserChoice | undefined>;
      want: {
        ok: boolean;
        remember?: compdbServiceLegacy.PersistentConsent;
      };
    };
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
      assert.deepStrictEqual(
        await getUserConsent(tc.current, tc.ask),
        tc.want,
        tc.name
      );
    }
  });
});
