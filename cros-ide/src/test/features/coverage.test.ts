// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as coverage from '../../features/coverage';
import * as testing from '../testing';

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
  let testRoot = '';

  beforeAll(async () => {
    testRoot = await fs.promises.mkdtemp(os.tmpdir() + '/');
    await testing.putFiles(testRoot, {
      [coverageJsonPath]: coverageJsonContents,
    });
  });

  afterAll(async () => {
    await fs.promises.rmdir(testRoot, {recursive: true});
  });

  it('ignores files not in platform2', async () => {
    assert.deepStrictEqual(
      await coverage.readDocumentCoverage(
        '/mnt/host/source/chromite/ide_tooling/cros-ide/package.cc',
        testRoot
      ),
      {}
    );
  });

  // TODO(ttylenda): coverage.json not found

  // TODO(ttylenda): coverage.json does not contain data for the file

  it('reads coverage data if it exists', async () => {
    const {covered: cov, uncovered: uncov} =
      await coverage.readDocumentCoverage(
        '/mnt/host/source/src/platform2/chaps/slot_manager_impl.cc',
        testRoot
      );
    assert.ok(cov);
    assert.ok(uncov);
  });
});
