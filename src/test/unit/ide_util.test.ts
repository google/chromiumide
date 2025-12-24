// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as ideUtil from '../../ide_util';
import * as testing from '../testing';

describe('IDE utilities', () => {
  const tempDir = testing.tempDir();

  it('returns VSCode executable path', async () => {
    interface TestCase {
      name: string;
      exe: string; // executable location relative to home
      appRoot: string; // vscode.env.appRoot value relative to home
      appName: string; // vscode.env.appName value
      remoteName: string | undefined; // vscode.env.remoteName value
    }
    const testCases: TestCase[] = [
      {
        name: 'code-server',
        exe: '.local/lib/code-server-3.12.0/bin/code-server',
        appRoot: '.local/lib/code-server-3.12.0/vendor/modules/code-oss-dev',
        appName: 'code-server',
        remoteName: 'localhost:49363',
      },
      {
        name: 'VSCode',
        exe: '/usr/share/code/bin/code',
        appRoot: '/usr/share/code/resources/app',
        appName: 'Visual Studio Code',
        remoteName: undefined,
      },
      {
        name: 'Remote VSCode',
        exe: '.vscode-server/bin/e18005f0f1b33c29e81d732535d8c0e47cafb0b5/bin/remote-cli/code',
        appRoot: '.vscode-server/bin/e18005f0f1b33c29e81d732535d8c0e47cafb0b5',
        appName: 'Visual Studio Code',
        remoteName: 'ssh-remote',
      },
      {
        name: 'Remote VSCodeInsiders',
        exe: '.vscode-server-insiders/bin/b84feecf9231d404a766e251f8a37c730089511b/bin/remote-cli/code-insiders',
        appRoot:
          '.vscode-server-insiders/bin/b84feecf9231d404a766e251f8a37c730089511b',
        appName: 'Visual Studio Code - Insiders',
        remoteName: 'ssh-remote',
      },
    ];
    for (const tc of testCases) {
      const home = path.join(tempDir.path, tc.name);
      await testing.putFiles(home, {
        [tc.exe]: 'exe',
      });
      const appRoot = path.join(home, tc.appRoot);
      const expected = path.join(home, tc.exe);
      expect(ideUtil.vscodeExecutablePath(appRoot, tc.appName, tc.remoteName))
        .withContext(tc.name)
        .toEqual(expected);
    }
  });

  it('returns Error on failure', async () => {
    const home = tempDir.path;
    await testing.putFiles(home, {
      'foo/bin/code-server': 'exe',
    });

    // Assert test is properly set up
    expect(
      ideUtil.vscodeExecutablePath(path.join(home, 'foo'), 'code-server')
    ).toEqual(path.join(home, 'foo/bin/code-server'));

    expect(
      ideUtil.vscodeExecutablePath(path.join(home, 'bar'), 'code-server')
    ).toBeInstanceOf(Error);
    expect(
      ideUtil.vscodeExecutablePath(path.join(home, 'foo'), 'unknown app')
    ).toBeInstanceOf(Error);
  });
});
