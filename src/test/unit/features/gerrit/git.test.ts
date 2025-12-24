// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  checkCommitExists,
  readGitLog,
  TEST_ONLY,
} from '../../../../features/gerrit/git';
import {Sink} from '../../../../features/gerrit/sink';
import * as testing from '../../../testing';
import {FakeStatusManager} from '../../../testing/fakes';

const {parseGitLog} = TEST_ONLY;

describe('parseGitLog', () => {
  it('extracts commit ids from git log', () => {
    const gitLog = `\
8c3682b20db653d55e4bb1e56294d4c16b95a5f5 I6f1ec79d7b221bb7c7343cc953db1b6f6369fbb4

c3b2ca4da09c2452eefad3f3bf98f0f675ba8ad3 Ic7594ee4825feb488c12aac31bb879c03932fb45
`;
    expect(parseGitLog(gitLog)).toEqual([
      {
        localCommitId: '8c3682b20db653d55e4bb1e56294d4c16b95a5f5',
        changeId: 'I6f1ec79d7b221bb7c7343cc953db1b6f6369fbb4',
      },
      {
        localCommitId: 'c3b2ca4da09c2452eefad3f3bf98f0f675ba8ad3',
        changeId: 'Ic7594ee4825feb488c12aac31bb879c03932fb45',
      },
    ]);
  });

  it('handles empty input', () => {
    expect(parseGitLog('')).toEqual([]);
  });

  it('ignores commits without change ids', () => {
    const gitLogWithMissingChangeId = `\
8c3682b20db653d55e4bb1e56294d4c16b95a5f5 \

c3b2ca4da09c2452eefad3f3bf98f0f675ba8ad3 Ic7594ee4825feb488c12aac31bb879c03932fb45`;

    expect(parseGitLog(gitLogWithMissingChangeId)).toEqual([
      {
        localCommitId: 'c3b2ca4da09c2452eefad3f3bf98f0f675ba8ad3',
        changeId: 'Ic7594ee4825feb488c12aac31bb879c03932fb45',
      },
    ]);
  });
});

describe('Git helper', () => {
  const tempDir = testing.tempDir();

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.length = 0;
  });

  it('detects which SHA is available locally', async () => {
    const sink = new Sink(new FakeStatusManager(), subscriptions);

    const repo = new testing.Git(tempDir.path);
    await repo.init();
    const existingCommitId = await repo.commit('Hello');

    expect(
      await checkCommitExists(existingCommitId, repo.root, sink)
    ).toBeTrue();
    expect(
      await checkCommitExists(
        '08f5019f534c2c5075c5de4425b7902d7517342e',
        repo.root,
        sink
      )
    ).toBeFalse();
  });

  it('returns local changes (works on detached head)', async () => {
    const sink = new Sink(new FakeStatusManager(), subscriptions);

    const repo = new testing.Git(tempDir.path);
    await repo.init();
    await repo.commit('First');
    await repo.setupCrosBranches();

    const changeId2 = 'Iaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const commitId2 = await repo.commit(`Second\n\nChange-Id: ${changeId2}`);

    const changeId3 = 'Ibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const commitId3 = await repo.commit(`Third\n\nChange-Id: ${changeId3}`);

    const branchLog = await readGitLog(repo.root, sink);
    expect(branchLog).toEqual([
      {
        localCommitId: commitId3,
        changeId: changeId3,
      },
      {
        localCommitId: commitId2,
        changeId: changeId2,
      },
    ]);

    await repo.checkout(commitId2);

    const detachedHeadLog = await readGitLog(repo.root, sink);
    expect(detachedHeadLog).toEqual([
      {
        localCommitId: commitId2,
        changeId: changeId2,
      },
    ]);
  });

  it('returns local changes from real commit messages', async () => {
    const sink = new Sink(new FakeStatusManager(), subscriptions);

    const repo = new testing.Git(tempDir.path);
    await repo.init();
    await repo.commit('First');
    await repo.setupCrosBranches();

    const commitId1 = await repo.commit(`\
cros-ide: reposition with --merge-base

WIP

BUG=b:216048068
TEST=tbd

Change-Id: I6f1ec79d7b221bb7c7343cc953db1b6f6369fbb4`);
    const commitId2 = await repo.commit(`\
cros-ide: support Gerrit threads

- When comments are retrieved we partition them into threads.
- The function to show comments is modified to take an array of comments
  corresponding to a thread.
- Repositioning is done only on the first comment in a thread, because
  it determines placement of the thread.

BUG=b:216048068
TEST=https://screenshot.googleplex.com/7krgA2sbxn6v4Uc.png

Change-Id: Ic7594ee4825feb488c12aac31bb879c03932fb45`);
    await repo.commit('\
cros-ide: reposition with --merge-base');
    const commitId3 = await repo.commit(`\
cros-ide: support Gerrit threads

Change-Id: I61e783b8b51b951cc173131fba7f6a923eaac3e6`);

    const branchLog = await readGitLog(repo.root, sink);
    expect(branchLog).toEqual([
      {
        localCommitId: commitId3,
        changeId: 'I61e783b8b51b951cc173131fba7f6a923eaac3e6',
      },
      {
        localCommitId: commitId2,
        changeId: 'Ic7594ee4825feb488c12aac31bb879c03932fb45',
      },
      {
        localCommitId: commitId1,
        changeId: 'I6f1ec79d7b221bb7c7343cc953db1b6f6369fbb4',
      },
    ]);
  });

  it('ignores change id inside a commit message', async () => {
    const sink = new Sink(new FakeStatusManager(), subscriptions);

    const repo = new testing.Git(tempDir.path);
    await repo.init();
    await repo.commit('First');
    await repo.setupCrosBranches();

    const commitId = await repo.commit(`\
cros-ide: support Gerrit threads

We can include Change-Id: Iabcd inside the message.

Change-Id: Ic7594ee4825feb488c12aac31bb879c03932fb45`);

    const branchLog = await readGitLog(repo.root, sink);
    expect(branchLog).toEqual([
      {
        localCommitId: commitId,
        changeId: 'Ic7594ee4825feb488c12aac31bb879c03932fb45',
      },
    ]);
  });
});
