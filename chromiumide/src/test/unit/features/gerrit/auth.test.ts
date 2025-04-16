// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as auth from '../../../../features/gerrit/auth/auth';
import {RepoId} from '../../../../features/gerrit/git';

describe('parseAuthGitcookies', () => {
  it('can parse a gitcookies', () => {
    expect(
      auth.TEST_ONLY.parseAuthGitcookies(
        'cros',
        'example.com\tFALSE\t/\tTRUE\t2147483647\to\tdifferentdomain\n' +
          '# chromium-review.googlesource.com\tFALSE\t/\tTRUE\t2147483647\to\tcommentedout\n' +
          'chromium-review.googlesource.com\tFALSE\t/\tTRUE\t2147483647\tabc\twrongkey\n' +
          'chromium-review.googlesource.com\tFALSE\t/\tTRUE\t2147483647\to\toldtoken\n' +
          'chromium-review.googlesource.com\tFALSE\t/\tTRUE\t2147483647\to\tnewtoken\n'
      )
    ).toBe('o=newtoken');
  });

  const repoIds: RepoId[] = ['cros', 'cros-internal', 'chromium'];
  for (const repoId of repoIds) {
    it(`parses wildcard domains for ${repoId}`, () => {
      expect(
        auth.TEST_ONLY.parseAuthGitcookies(
          repoId,
          '.googlesource.com\tTRUE\t/\tTRUE\t2147483647\to\twildcard\n'
        )
      ).toBe('o=wildcard');
    });
  }
});
