// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as testing from '..';
import * as cipd from '../../../common/cipd';

/**
 * Installs a fake cipd executable for testing, and returns a CipdRepository
 * ready to use for testing. Returned CipdRepository is refreshed per test.
 *
 * This function should be called in describe.
 */
export function installFakeCipd(
  fakeExec: testing.FakeExec
): cipd.CipdRepository {
  const tempDir = testing.tempDir();
  const cipdRepository = new cipd.CipdRepository(tempDir.path);

  beforeEach(() => {
    Object.assign(cipdRepository, new cipd.CipdRepository(tempDir.path));
    fakeExec.on(
      'cipd',
      testing.exactMatch(
        [
          'install',
          '-root',
          tempDir.path,
          'chromiumos/infra/crosfleet/${platform}',
          'prod',
        ],
        async () => 'ok'
      )
    );
  });

  return cipdRepository;
}
