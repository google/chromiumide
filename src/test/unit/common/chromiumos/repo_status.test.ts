// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import {Board} from '../../../../../shared/app/common/chromiumos/board_or_host';
import {getCrosPrebuiltVersionsFromBinHost} from '../../../../common/chromiumos/repo_status';
import * as services from '../../../../services';
import * as testing from '../../../testing';

describe('repo status', () => {
  const tempDir = testing.tempDir();

  const state = testing.cleanState(async () => {
    await testing.buildFakeChromeos(tempDir.path);
    const chrootService = services.chromiumos.ChrootService.maybeCreate(
      tempDir.path,
      false
    )!;
    await testing.putFiles(tempDir.path, {
      // Valid file for a private board (betty) containing >1 CrOS major version.
      'src/private-overlays/chromeos-partner-overlay/chromeos/binhost/target/betty-POSTSUBMIT_BINHOST.conf':
        'POSTSUBMIT_BINHOST="gs://chromeos-prebuilt/board/betty/postsubmit-R122-15751.0.0-93635-8758349179001996977/packages gs://chromeos-prebuilt/board/betty/postsubmit-R122-15752.0.0-93649-8758322426129041873/packages gs://chromeos-prebuilt/board/betty/postsubmit-R122-15752.0.0-93663-8758296619349456689/packages gs://chromeos-prebuilt/board/betty/postsubmit-R122-15752.0.0-93676-8758270828991947137/packages"',
      // Valid file for a public board (amd64-generic).
      'src/third_party/chromiumos-overlay/chromeos/binhost/target/amd64-generic-POSTSUBMIT_BINHOST.conf':
        'POSTSUBMIT_BINHOST="gs://chromeos-prebuilt/board/amd64-generic/postsubmit-R122-15752.0.0-61353-8758249972444919777/packages gs://chromeos-prebuilt/board/amd64-generic/postsubmit-R122-15752.0.0-61354-8758248213695494001/packages gs://chromeos-prebuilt/board/amd64-generic/postsubmit-R122-15752.0.0-61355-8758246175632064529/packages gs://chromeos-prebuilt/board/amd64-generic/postsubmit-R122-15752.0.0-61356-8758244334014206945/packages"',
      // Invalid file for a fake board; does not contain postsubmit image for board 'foo'.
      'src/private-overlays/chromeos-partner-overlay/chromeos/binhost/target/foo-POSTSUBMIT_BINHOST.conf':
        'POSTSUBMIT_BINHOST="gs://chromeos-prebuilt/board/amd64-generic/postsubmit-R122-15752.0.0-61353-8758249972444919777/packages gs://chromeos-prebuilt/board/amd64-generic/postsubmit-R122-15752.0.0-61354-8758248213695494001/packages gs://chromeos-prebuilt/board/amd64-generic/postsubmit-R122-15752.0.0-61355-8758246175632064529/packages gs://chromeos-prebuilt/board/amd64-generic/postsubmit-R122-15752.0.0-61356-8758244334014206945/packages"',
    });
    const root = chrootService.chromiumos.root;

    return {
      chrootService,
      root,
    };
  });

  it('gets CrOS prebuilt image versions of a private board', async () => {
    await expectAsync(
      getCrosPrebuiltVersionsFromBinHost(
        Board.newBoard('betty'),
        state.chrootService
      )
    ).toBeResolvedTo([
      {
        chromeMilestone: 122,
        chromeOsMajor: 15751,
        chromeOsMinor: 0,
        chromeOsPatch: 0,
        snapshotId: '93635',
        buildId: '8758349179001996977',
      },
      {
        chromeMilestone: 122,
        chromeOsMajor: 15752,
        chromeOsMinor: 0,
        chromeOsPatch: 0,
        snapshotId: '93649',
        buildId: '8758322426129041873',
      },
      {
        chromeMilestone: 122,
        chromeOsMajor: 15752,
        chromeOsMinor: 0,
        chromeOsPatch: 0,
        snapshotId: '93663',
        buildId: '8758296619349456689',
      },
      {
        chromeMilestone: 122,
        chromeOsMajor: 15752,
        chromeOsMinor: 0,
        chromeOsPatch: 0,
        snapshotId: '93676',
        buildId: '8758270828991947137',
      },
    ]);
  });

  it('gets CrOS prebuilt image versions of a public board', async () => {
    await expectAsync(
      getCrosPrebuiltVersionsFromBinHost(
        Board.newBoard('amd64-generic'),
        state.chrootService
      )
    ).toBeResolvedTo([
      {
        chromeMilestone: 122,
        chromeOsMajor: 15752,
        chromeOsMinor: 0,
        chromeOsPatch: 0,
        snapshotId: '61353',
        buildId: '8758249972444919777',
      },
      {
        chromeMilestone: 122,
        chromeOsMajor: 15752,
        chromeOsMinor: 0,
        chromeOsPatch: 0,
        snapshotId: '61354',
        buildId: '8758248213695494001',
      },
      {
        chromeMilestone: 122,
        chromeOsMajor: 15752,
        chromeOsMinor: 0,
        chromeOsPatch: 0,
        snapshotId: '61355',
        buildId: '8758246175632064529',
      },
      {
        chromeMilestone: 122,
        chromeOsMajor: 15752,
        chromeOsMinor: 0,
        chromeOsPatch: 0,
        snapshotId: '61356',
        buildId: '8758244334014206945',
      },
    ]);
  });

  it('returns error on corrupted BINHOST file', async () => {
    expect(
      (
        (await getCrosPrebuiltVersionsFromBinHost(
          Board.newBoard('foo'),
          state.chrootService
        )) as Error
      ).message
    ).toContain('Binhost file for foo does not contain valid prebuilt path');
  });

  it('returns error on binhost file not found', async () => {
    expect(
      (
        (await getCrosPrebuiltVersionsFromBinHost(
          Board.newBoard('bar'),
          state.chrootService
        )) as Error
      ).message
    ).toContain('bar has no binhost file');
  });
});
