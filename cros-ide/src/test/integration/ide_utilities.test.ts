// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as path from 'path';
import * as commonUtil from '../../common/common_util';
import * as ideUtilities from '../../ide_utilities';
import * as testing from '../testing';

describe('IDE utilities', () => {
  it('returns VSCode executable path', async () => {
    interface TestCase {
        name: string,
        exe: string, // executable location relative to home
        appRoot: string, // vscode.env.appRoot value relative to home
        appName: string, // vscode.env.appName value
    }
    const testCases: TestCase[] = [
      {
        name: 'code-server',
        exe: '.local/lib/code-server-3.12.0/bin/code-server',
        appRoot: '.local/lib/code-server-3.12.0/vendor/modules/code-oss-dev',
        appName: 'code-server',
      },
      {
        name: 'VSCode',
        exe: '.vscode-server/bin/e18005f0f1b33c29e81d732535d8c0e47cafb0b5/bin/remote-cli/code',
        appRoot: '.vscode-server/bin/e18005f0f1b33c29e81d732535d8c0e47cafb0b5',
        appName: 'Visual Studio Code',
      },
      {
        name: 'VSCode Insiders',
        // eslint-disable-next-line max-len
        exe: '.vscode-server-insiders/bin/b84feecf9231d404a766e251f8a37c730089511b/bin/remote-cli/code-insiders',
        appRoot: '.vscode-server-insiders/bin/b84feecf9231d404a766e251f8a37c730089511b',
        appName: 'Visual Studio Code - Insiders',
      },
    ];
    for (const tc of testCases) {
      await commonUtil.withTempDir(async home => {
        await testing.putFiles(home, {
          [tc.exe]: 'exe',
        });
        const appRoot = path.join(home, tc.appRoot);
        const appName = tc.appName;
        const expected = path.join(home, tc.exe);
        assert.strictEqual(ideUtilities.vscodeExecutablePath(appRoot, appName), expected, tc.name);
      });
    }
  });

  it('returns Error on failure', async () => {
    await commonUtil.withTempDir(async home => {
      await testing.putFiles(home, {
        'foo/bin/code-server': 'exe',
      });

      // Assert test is properly set up
      assert.strictEqual(ideUtilities.vscodeExecutablePath(
          path.join(home, 'foo'), 'code-server'), path.join(home, 'foo/bin/code-server'));

      assert(ideUtilities.vscodeExecutablePath(
          path.join(home, 'bar'), 'code-server') instanceof Error, 'not found');
      assert(ideUtilities.vscodeExecutablePath(
          path.join(home, 'foo'), 'unknown app') instanceof Error, 'unknown app');
    });
  });
});
