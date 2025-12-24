// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as mapping from '../../../../../services/chromiumos/packages/mapping';

const {extractPlatformSubdir} = mapping.TEST_ONLY;

describe('extractPlatformSubdir', () => {
  [
    {
      name: 'succeeds (inherit comes first)',
      content: `inherit platform
PLATFORM_SUBDIR="foo"`,
      want: 'foo',
    },
    {
      name: 'succeeds (inherit comes later)',
      content: `PLATFORM_SUBDIR="foo"
inherit platform`,
      want: 'foo',
    },
    {
      name: 'succeeds (concats line ends with \\)',
      content: `inherit \\
platform
PLATFORM_SUBDIR=\\
"foo"`,
      want: 'foo',
    },
    {
      name: 'succeeds (inherit contains other item)',
      content: `inherit foo platform bar
PLATFORM_SUBDIR="foo"`,
      want: 'foo',
    },
    {
      name: 'succeeds (subdir contains a slash)',
      content: `inherit platform
PLATFORM_SUBDIR="foo/bar"`,
      want: 'foo/bar',
    },
    {
      name: 'fails (no inherit platform)',
      content: 'PLATFORM_SUBDIR="foo"',
      want: undefined,
    },
    {
      name: 'fails (no platform subdir)',
      content: 'inherit platform',
      want: undefined,
    },
  ].forEach(testCase => {
    it(testCase.name, async () => {
      expect(extractPlatformSubdir(testCase.content)).toBe(testCase.want);
    });
  });
});
