// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../../../common/common_util';
import {Watcher} from '../../../../../services/watchers/git_dirs/head';
import * as testing from '../../../../testing';

async function gitInit(root: string) {
  await commonUtil.execOrThrow('git', ['init'], {cwd: root});
}

// Run git commit and returns commit hash.
async function gitCommit(root: string, message: string): Promise<string> {
  await commonUtil.execOrThrow(
    'git',
    ['commit', '--allow-empty', '-m', message],
    {cwd: root}
  );
  return (
    await commonUtil.execOrThrow('git', ['rev-parse', 'HEAD'], {cwd: root})
  ).stdout.trim();
}

describe('git.Watcher', () => {
  const tempDir = testing.tempDir();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.splice(0);
  });

  it('emits events on right timing', async () => {
    const root = tempDir.path;

    await gitInit(root);
    // Create initial commit before creating a watcher, because it cannot handle
    // empty git repository.
    const firstHash = await gitCommit(root, 'First commit');

    const watcher = new Watcher(root);
    subscriptions.push(watcher);

    const reader = new testing.EventReader(watcher.onDidChange);
    subscriptions.push(reader);

    expect(await reader.read()).toEqual({head: firstHash});

    const secondHash = await gitCommit(root, 'Second commit');

    expect(await reader.read()).toEqual({head: secondHash});

    const thirdHash = await gitCommit(root, 'Third commit');

    expect(await reader.read()).toEqual({head: thirdHash});

    await commonUtil.execOrThrow('git', ['checkout', 'HEAD~'], {cwd: root});

    expect(await reader.read()).toEqual({head: secondHash});
  });
});
