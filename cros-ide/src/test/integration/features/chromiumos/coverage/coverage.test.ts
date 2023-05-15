// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import {Coverage} from '../../../../../features/chromiumos/coverage';
import * as services from '../../../../../services';
import * as config from '../../../../../services/config';
import * as testing from '../../../../testing';
import {FakeStatusManager} from '../../../../testing/fakes';

const coverageJsonContents =
  `{"data": [{ "files": [{
  "filename": "/build/amd64-generic/var/cache/portage/chromeos-base/chaps/out/Default/` +
  '../../../../../../../tmp/portage/chromeos-base/chaps-0.0.1-r3594/work/chaps-0.0.1/chaps/' +
  `slot_manager_impl.cc",
  "segments": [
    [142, 50, 515, true, true, false],
    [147, 2, 0, false, false, false],
    [156, 61, 313, true, true, false ]
    ]}]}]}
`;

const coverageJsonPath =
  '/build/amd64-generic/build/coverage_data/chromeos-base/chaps-0/0.0.1-r3594/coverage.json';

describe('Test coverage', () => {
  const tempDir = testing.tempDir();

  const state = testing.cleanState(async () => {
    const chroot = await testing.buildFakeChroot(tempDir.path);
    await testing.putFiles(chroot, {
      [coverageJsonPath]: coverageJsonContents,
    });
    const chrootService = services.chromiumos.ChrootService.maybeCreate(
      tempDir.path
    )!;
    return {
      coverage: new Coverage(chrootService, new FakeStatusManager()),
    };
  });

  it('ignores files not in platform2', async () => {
    assert.deepStrictEqual(
      await state.coverage.readDocumentCoverage(
        '/mnt/host/source/chromite/ide_tooling/cros-ide/package.cc'
      ),
      {}
    );
  });

  // TODO(ttylenda): coverage.json not found

  // TODO(ttylenda): coverage.json does not contain data for the file

  it('reads coverage data if it exists', async () => {
    await config.board.update('amd64-generic');

    const {covered: cov, uncovered: uncov} =
      await state.coverage.readDocumentCoverage(
        '/mnt/host/source/src/platform2/chaps/slot_manager_impl.cc'
      );
    assert.ok(cov);
    assert.ok(uncov);
  });
});
