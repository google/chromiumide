// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as auth from '../../../../features/gerrit/auth';

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
});
