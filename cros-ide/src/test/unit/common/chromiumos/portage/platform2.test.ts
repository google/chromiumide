// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  Platform2Package,
  platform2TestWorkingDirectory,
} from '../../../../../common/chromiumos/portage/platform2';

describe('platform2TestWorkingDirectory works for', () => {
  const testCases: {
    name: string;
    board: string | undefined;
    pkg: Platform2Package;
    want: string;
  }[] = [
    {
      name: 'missive-9999 on brya',
      board: 'brya',
      pkg: {
        category: 'chromeos-base',
        name: 'missive',
        version: '9999',
        platformSubdir: 'missive',
        crosWorkonDestdir: '${S}/platform2',
      },
      want: '/build/brya/tmp/portage/chromeos-base/missive-9999/work/missive-9999/platform2/missive',
    },
    {
      name: 'arc-keymaster-9999 on brya',
      board: 'brya',
      pkg: {
        category: 'chromeos-base',
        name: 'arc-keymaster',
        version: '9999',
        platformSubdir: 'arc/keymaster',
        crosWorkonDestdir: ['${S}/platform2', '${S}/aosp/system/keymaster'],
      },
      want: '/build/brya/tmp/portage/chromeos-base/arc-keymaster-9999/work/arc-keymaster-9999/platform2/arc/keymaster',
    },
    {
      name: 'shill-0.0.5-r4021 on brya',
      board: 'brya',
      pkg: {
        category: 'chromeos-base',
        name: 'shill',
        version: '0.0.5',
        revision: 'r4021',
        platformSubdir: 'shill',
        crosWorkonDestdir: '',
        crosWorkonOutoftreeBuild: '1',
      },
      want: '/build/brya/tmp/portage/chromeos-base/shill-0.0.5-r4021/work/shill-0.0.5/shill',
    },
  ];

  for (const tc of testCases) {
    it(tc.name, () => {
      const got = platform2TestWorkingDirectory(tc.board, tc.pkg);
      expect(got).toEqual(tc.want);
    });
  }
});
