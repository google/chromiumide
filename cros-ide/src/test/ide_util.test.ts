// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {WrapFs} from '../common/cros';
import * as ideUtil from '../ide_util';
import * as testing from './testing';
import {installVscodeDouble} from './doubles';
import {fakeGetConfiguration} from './fakes/workspace_configuration';

describe('IDE utilities', () => {
  const tempDir = testing.tempDir();

  it('returns VSCode executable path', async () => {
    interface TestCase {
      name: string;
      exe: string; // executable location relative to home
      appRoot: string; // vscode.env.appRoot value relative to home
      appName: string; // vscode.env.appName value
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
        name: 'VSCodeInsiders',
        exe: '.vscode-server-insiders/bin/b84feecf9231d404a766e251f8a37c730089511b/bin/remote-cli/code-insiders',
        appRoot:
          '.vscode-server-insiders/bin/b84feecf9231d404a766e251f8a37c730089511b',
        appName: 'Visual Studio Code - Insiders',
      },
    ];
    for (const tc of testCases) {
      const home = path.join(tempDir.path, tc.name);
      await testing.putFiles(home, {
        [tc.exe]: 'exe',
      });
      const appRoot = path.join(home, tc.appRoot);
      const appName = tc.appName;
      const expected = path.join(home, tc.exe);
      assert.strictEqual(
        ideUtil.vscodeExecutablePath(appRoot, appName),
        expected,
        tc.name
      );
    }
  });

  it('returns Error on failure', async () => {
    const home = tempDir.path;
    await testing.putFiles(home, {
      'foo/bin/code-server': 'exe',
    });

    // Assert test is properly set up
    assert.strictEqual(
      ideUtil.vscodeExecutablePath(path.join(home, 'foo'), 'code-server'),
      path.join(home, 'foo/bin/code-server')
    );

    assert(
      ideUtil.vscodeExecutablePath(
        path.join(home, 'bar'),
        'code-server'
      ) instanceof Error,
      'not found'
    );
    assert(
      ideUtil.vscodeExecutablePath(
        path.join(home, 'foo'),
        'unknown app'
      ) instanceof Error,
      'unknown app'
    );
  });
});

describe('getOrSelectTargetBoard', () => {
  const tempDir = testing.tempDir();

  const {vscodeSpy} = installVscodeDouble();

  it('returns stored board', async () => {
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    vscode.workspace
      .getConfiguration('cros-ide')
      .update('board', 'amd64-generic');
    const chroot = await testing.buildFakeChroot(tempDir.path);

    expect(await ideUtil.getOrSelectTargetBoard(new WrapFs(chroot))).toBe(
      'amd64-generic'
    );
  });

  it('returns error if no board has been setup', async () => {
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    const chroot = await testing.buildFakeChroot(tempDir.path);

    expect(await ideUtil.getOrSelectTargetBoard(new WrapFs(chroot))).toEqual(
      new ideUtil.NoBoardError()
    );
    expect(vscode.workspace.getConfiguration('cros-ide').get('board')).toBe(
      undefined
    );
  });

  it('shows default board', async () => {
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    const chroot = await testing.buildFakeChroot(tempDir.path);
    await testing.putFiles(chroot, {
      '/build/amd64-generic/x': 'x',
      '/build/bin/x': 'x',
    });

    vscodeSpy.window.showWarningMessage
      .withArgs(
        'Target board is not set. Do you use amd64-generic?',
        {title: 'Yes'},
        {title: 'Customize'}
      )
      .and.returnValue({title: 'Yes'});

    expect(await ideUtil.getOrSelectTargetBoard(new WrapFs(chroot))).toBe(
      'amd64-generic'
    );
    expect(
      vscode.workspace.getConfiguration('cros-ide').get<string>('board')
    ).toBe('amd64-generic');
  });

  it('shows boards to select', async () => {
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    const chroot = await testing.buildFakeChroot(tempDir.path);
    await testing.putFiles(chroot, {
      '/build/amd64-generic/x': 'x',
      '/build/bin/x': 'x',
      '/build/coral/x': 'x',
      '/build/eve/x': 'x',
    });

    vscodeSpy.window.showWarningMessage
      .withArgs(
        jasmine.stringContaining('Target board is not set. Do you use '),
        {title: 'Yes'},
        {title: 'Customize'}
      )
      .and.returnValue({title: 'Customize'});
    vscodeSpy.window.showQuickPick
      .withArgs(jasmine.arrayContaining(['amd64-generic', 'coral', 'eve']), {
        title: 'Target board',
      })
      .and.returnValue('coral');

    expect(await ideUtil.getOrSelectTargetBoard(new WrapFs(chroot))).toBe(
      'coral'
    );
    expect(
      vscode.workspace.getConfiguration('cros-ide').get<string>('board')
    ).toBe('coral');
  });

  it('returns null if message is dismissed', async () => {
    vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
    const chroot = await testing.buildFakeChroot(tempDir.path);
    await testing.putFiles(chroot, {
      '/build/amd64-generic/x': 'x',
      '/build/bin/x': 'x',
    });

    vscodeSpy.window.showWarningMessage
      .withArgs(
        'Target board is not set. Do you use amd64-generic?',
        {title: 'Yes'},
        {title: 'Customize'}
      )
      .and.returnValue(undefined);

    expect(await ideUtil.getOrSelectTargetBoard(new WrapFs(chroot))).toBe(null);
    expect(
      vscode.workspace.getConfiguration('cros-ide').get<string>('board')
    ).toBe(undefined);
  });
});
