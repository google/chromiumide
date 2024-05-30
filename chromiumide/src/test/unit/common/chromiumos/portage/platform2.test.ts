// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import {parseBoardOrHost} from '../../../../../../shared/app/common/chromiumos/board_or_host';
import {
  Platform2Package,
  platform2TestWorkingDirectory,
  parsePlatform2EbuildOrThrow,
} from '../../../../../common/chromiumos/portage/platform2';
import * as testing from '../../../../testing';
import {FakeTextDocument} from '../../../../testing/fakes';

describe('platform2TestWorkingDirectory works for', () => {
  const testCases: {
    name: string;
    board: string;
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
        crosWorkonLocalname: ['platform2'],
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
        crosWorkonLocalname: ['platform2', 'aosp/system/keymaster'],
      },
      want: '/build/brya/tmp/portage/chromeos-base/arc-keymaster-9999/work/arc-keymaster-9999/platform2/arc/keymaster',
    },
    {
      name: 'shill-9999 on brya',
      board: 'brya',
      pkg: {
        category: 'chromeos-base',
        name: 'shill',
        version: '9999',
        platformSubdir: 'shill',
        crosWorkonDestdir: '',
        crosWorkonOutoftreeBuild: '1',
        crosWorkonLocalname: ['platform2'],
      },
      want: '/mnt/host/source/src/platform2/shill',
    },
  ];

  for (const tc of testCases) {
    it(tc.name, () => {
      const got = platform2TestWorkingDirectory(
        parseBoardOrHost(tc.board),
        tc.pkg
      );
      expect(got).toEqual(tc.want);
    });
  }
});

describe('parsePlatform2EbuildOrThrow works for', () => {
  const {vscodeSpy} = testing.installVscodeDouble();
  const ebuildPath = testing.testdataUri('portage/portage-9999.ebuild').fsPath;
  beforeEach(async () => {
    vscodeSpy.workspace.openTextDocument.and.returnValue(
      new FakeTextDocument({
        text: await fs.promises.readFile(ebuildPath, 'utf8'),
      })
    );
  });
  it('testing ebuild', async () => {
    const parsedPackage = await parsePlatform2EbuildOrThrow(ebuildPath);
    expect(parsedPackage).toEqual({
      // EbuildPackage (and ParsedPackageName) contents.
      category: 'testdata',
      name: 'portage',
      version: '9999',
      revision: undefined,

      platformSubdir: '',
      crosWorkonDestdir: ['${S}/platform2', '${S}/aosp/system/keymaster'],
      crosWorkonOutoftreeBuild: undefined,
      crosWorkonLocalname: ['platform2'],
    });
  });
});
