// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as commonUtil from '../../../../shared/app/common/common_util';
import {getDriver} from '../../../../shared/app/common/driver_repository';
import * as testing from '../../testing';

const driver = getDriver();

function assertNotGitRepository(tempDir: string) {
  const tempRoot = /(\/\w+)/.exec(tempDir)![1];
  if (fs.existsSync(path.join(tempRoot, '.git'))) {
    throw new Error(
      `bad test environment: please remove ${tempRoot}/.git and rerun the test`
    );
  }
}

describe('findGitDir', () => {
  const tempDir = testing.tempDir();
  const fullPath = (p: string) => path.join(tempDir.path, p);

  it('throws error when file is not under root', async () => {
    await expectAsync(
      driver.findGitDir(fullPath('a/b/c'), fullPath('x'))
    ).toBeRejectedWithError(/must be under/);
  });

  it('returns Git root directory', async () => {
    assertNotGitRepository(tempDir.path);
    await testing.putFiles(tempDir.path, {
      'a/b/c/d.txt': '',
      'a/e.txt': '',
      'x/y/z.txt': '',
    });
    await commonUtil.exec('git', ['init'], {
      cwd: fullPath('a/b'),
    });
    await commonUtil.exec('git', ['init'], {cwd: fullPath('a')});

    expect(await driver.findGitDir(fullPath('a/b/c/d.txt'))).toEqual(
      fullPath('a/b')
    );
    expect(await driver.findGitDir(fullPath('a/b/c/no_such_file.txt'))).toEqual(
      fullPath('a/b')
    );
    expect(await driver.findGitDir(fullPath('a/b/c'))).toEqual(fullPath('a/b'));
    expect(await driver.findGitDir(fullPath('a/b'))).toEqual(fullPath('a/b'));
    expect(await driver.findGitDir(fullPath('a/e.txt'))).toEqual(fullPath('a'));
    expect(await driver.findGitDir(fullPath('a'))).toEqual(fullPath('a'));
    expect(await driver.findGitDir(fullPath('x/y/z.txt'))).toBeUndefined();
  });
});
