// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {ParsedEbuildFilepath} from '../../../../../common/chromiumos/portage/ebuild';

describe('Ebuild filepath parsing on', () => {
  const testCases: {
    filepath: string;
    want: ParsedEbuildFilepath;
  }[] = [
    {
      filepath:
        '/mnt/host/source/src/third_party/chromiumos-overlay/chromeos-base/shill/shill-0.0.5-r4021.ebuild',
      want: new ParsedEbuildFilepath(
        '/mnt/host/source/src/third_party/chromiumos-overlay',
        {
          category: 'chromeos-base',
          name: 'shill',
          version: '0.0.5',
          revision: 'r4021',
        }
      ),
    },
    {
      filepath:
        '/path/to/chromeos-base/arc-keymaster/arc-keymaster-9999.ebuild',
      want: new ParsedEbuildFilepath('/path/to', {
        category: 'chromeos-base',
        name: 'arc-keymaster',
        version: '9999',
        revision: undefined,
      }),
    },
  ];

  for (const tc of testCases) {
    it(tc.filepath, () => {
      const got = ParsedEbuildFilepath.parseOrThrow(tc.filepath);
      expect(got).toEqual(tc.want);
      expect(`${got}`).toEqual(tc.filepath);
    });
  }
});
