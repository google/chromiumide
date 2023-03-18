// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as api from '../../../../features/gerrit/api';
import * as auth from '../../../../features/gerrit/auth';
import {TEST_ONLY} from '../../../../features/gerrit/gerrit';
import * as metrics from '../../../../features/metrics/metrics';
import * as bgTaskStatus from '../../../../ui/bg_task_status';
import {TaskStatus} from '../../../../ui/bg_task_status';
import * as testing from '../../../testing';
import {VoidOutputChannel} from '../../../testing/fakes';
import {FakeCommentController} from '../../../testing/fakes/comment_controller';
import {FakeGerrit} from './fake_env';

const {Gerrit} = TEST_ONLY;

const AUTHOR: api.AccountInfo = Object.freeze({
  _account_id: 1355869,
  name: 'Tomasz Tylenda',
  email: 'ttylenda@chromium.org',
  avatars: [
    {
      url: 'https://lh3.googleusercontent.com/photo.jpg',
      height: 32,
    },
  ],
});

function CHANGE_INFO(changeId: string, commitIds: string[]): api.ChangeInfo {
  const revisions: {[commitId: string]: Object} = {};
  for (const commitId of commitIds) revisions[commitId] = {};
  return {change_id: changeId, revisions} as api.ChangeInfo;
}

const COMMENT_INFO_TEMPLATE = Object.freeze({
  author: AUTHOR,
  change_message_id: '592dcb09ed96952012e147fe621d264db460cd6f',
  unresolved: true,
  patch_set: 1,
  updated: '2022-10-13 05:27:40.000000000',
});

// Based on crrev.com/c/3951631
const SIMPLE_COMMENT_INFOS_MAP = (
  commitId1: string
): api.FilePathToBaseCommentInfos => {
  return {
    'cryptohome/cryptohome.cc': [
      {
        ...COMMENT_INFO_TEMPLATE,
        id: 'b2698729_8e2b9e9a',
        line: 3,
        message: 'Unresolved comment on the added line.',
        commit_id: commitId1,
      },
    ],
  };
};

const SIMPLE_DRAFT_COMMENT_INFOS_MAP = (
  commitId1: string
): api.FilePathToBaseCommentInfos => {
  return {
    'cryptohome/cryptohome.cc': [
      {
        ...COMMENT_INFO_TEMPLATE,
        id: 'aaaaaaaaa_bbbbbbbb',
        line: 3,
        message: 'Draft reply.',
        commit_id: commitId1,
        in_reply_to: 'b2698729_8e2b9e9a',
        updated: '2022-10-13 05:43:50.000000000',
      },
    ],
  };
};

// Based on crrev.com/c/3980425
// For testing chains of changes
const SECOND_COMMIT_IN_CHAIN = (
  commitId: string
): api.FilePathToBaseCommentInfos => {
  return {
    'cryptohome/cryptohome.cc': [
      {
        ...COMMENT_INFO_TEMPLATE,
        id: '91ffb8ea_d3594fb4',
        line: 6,
        message: 'Comment on the second change',
        commit_id: commitId,
      },
    ],
  };
};

// Based on crrev.com/c/3954724, important bits are:
//   "Comment on termios" on line 15 (1-base) of the first patch set
//   "Comment on unistd" on line 18 (1-base) of the second patch set, resolved
const TWO_PATCHSETS_COMMENT_INFOS_MAP = (
  commitId1: string,
  commitId2: string
): api.FilePathToBaseCommentInfos => {
  return {
    'cryptohome/cryptohome.cc': [
      {
        ...COMMENT_INFO_TEMPLATE,
        // Note, that we use commit_id to identify distinct patchset, not the patch_set.
        id: '3d3c9023_4550daf0',
        line: 15,
        message: 'Comment on termios',
        commit_id: commitId1,
      },
      {
        ...COMMENT_INFO_TEMPLATE,
        id: '9845ccec_3e772fd4',
        line: 18,
        message: 'Comment on unistd',
        commit_id: commitId2,
        unresolved: false,
      },
    ],
  };
};

const GITCOOKIES_PATH = path.join(
  __dirname,
  '../../../../../src/test/testdata/gerrit/gitcookies'
);

describe('Gerrit', () => {
  const tempDir = testing.tempDir();

  function abs(relative: string) {
    return path.join(tempDir.path, relative);
  }

  const {vscodeSpy} = testing.installVscodeDouble();

  beforeEach(() => {
    spyOn(metrics, 'send');
    spyOn(auth, 'getGitcookiesPath').and.resolveTo(GITCOOKIES_PATH);
  });

  const state = testing.cleanState(() => {
    const state = {
      statusBarItem: jasmine.createSpyObj<vscode.StatusBarItem>(
        'statusBarItem',
        ['hide', 'show']
      ),
      commentController: new FakeCommentController(),
      outputChannel: new VoidOutputChannel(),
      statusManager: jasmine.createSpyObj<bgTaskStatus.StatusManager>(
        'statusManager',
        ['setStatus']
      ),
    };

    vscodeSpy.window.createStatusBarItem.and.returnValue(state.statusBarItem);
    vscodeSpy.comments.createCommentController.and.returnValue(
      state.commentController
    );
    vscodeSpy.window.createOutputChannel.and.returnValue(state.outputChannel);

    return state;
  });

  const subscriptions: vscode.Disposable[] = [];
  afterEach(() => {
    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.length = 0;
  });

  it('displays a comment', async () => {
    // Create a repo with two commits:
    //   1) The first simulates cros/main.
    //   2) The second is the commit on which Gerrit review is taking place.
    const git = new testing.Git(tempDir.path);
    await git.init();
    await git.commit('First');
    await git.setupCrosBranches();
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc': 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n',
    });
    await git.addAll();
    const changeId = 'I23f50ecfe44ee28972aa640e1fa82ceabcc706a8';
    const commitId = await git.commit(`Second\nChange-Id: ${changeId}`);

    const gerrit = new Gerrit(
      state.outputChannel,
      state.statusBarItem,
      state.statusManager
    );
    subscriptions.push(gerrit);

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: CHANGE_INFO(changeId, [commitId]),
      comments: SIMPLE_COMMENT_INFOS_MAP(commitId),
    });

    await expectAsync(
      gerrit.showChanges(abs('cryptohome/cryptohome.cc'))
    ).toBeResolved();

    const threads = state.commentController.threads;
    expect(threads.length).toEqual(1);
    expect(threads[0].uri.fsPath).toEqual(abs('cryptohome/cryptohome.cc'));
    expect(threads[0].range.start.line).toEqual(2);
    expect(threads[0].comments[0].body).toEqual(
      new vscode.MarkdownString('Unresolved comment on the added line.')
    );
    expect(threads[0].comments[0].contextValue).toEqual('<public>');

    expect(state.statusBarItem.show).toHaveBeenCalled();
    expect(state.statusBarItem.hide).not.toHaveBeenCalled();
    expect(state.statusBarItem.text).toEqual('$(comment) 1');
    expect(metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'gerrit',
      action: 'update comments',
      value: 1,
    });
    expect(state.statusManager.setStatus).not.toHaveBeenCalled();
  });

  it('displays a draft comment', async () => {
    // Create a repo with two commits:
    //   1) The first simulates cros/main.
    //   2) The second is the commit on which Gerrit review is taking place.
    const git = new testing.Git(tempDir.path);
    await git.init();
    await git.commit('First');
    await git.setupCrosBranches();
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc': 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n',
    });
    await git.addAll();
    const changeId = 'I23f50ecfe44ee28972aa640e1fa82ceabcc706a8';
    const commitId = await git.commit(`Second\nChange-Id: ${changeId}`);

    const gerrit = new Gerrit(
      state.outputChannel,
      state.statusBarItem,
      state.statusManager
    );
    subscriptions.push(gerrit);

    FakeGerrit.initialize({accountsMe: AUTHOR}).setChange({
      id: changeId,
      info: CHANGE_INFO(changeId, [commitId]),
      comments: SIMPLE_COMMENT_INFOS_MAP(commitId),
      drafts: SIMPLE_DRAFT_COMMENT_INFOS_MAP(commitId),
    });

    await expectAsync(
      gerrit.showChanges(abs('cryptohome/cryptohome.cc'))
    ).toBeResolved();

    const threads = state.commentController.threads;
    expect(threads.length).toEqual(1);
    expect(threads[0].uri.fsPath).toEqual(abs('cryptohome/cryptohome.cc'));
    expect(threads[0].range.start.line).toEqual(2);
    const comments = threads[0].comments;
    expect(comments.length).toEqual(2);
    expect(comments[0].body).toEqual(
      new vscode.MarkdownString('Unresolved comment on the added line.')
    );
    expect(comments[0].contextValue).toEqual('<public>');
    expect(comments[1].body).toEqual(new vscode.MarkdownString('Draft reply.'));
    expect(comments[1].contextValue).toEqual('<draft>');

    expect(state.statusBarItem.show).toHaveBeenCalled();
    expect(state.statusBarItem.hide).not.toHaveBeenCalled();
    expect(state.statusBarItem.text).toEqual('$(comment) 1');
    expect(metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'gerrit',
      action: 'update comments',
      value: 1,
    });
    expect(state.statusManager.setStatus).not.toHaveBeenCalled();
  });

  it('handles special comment types (line, file, commit msg, patchset)', async () => {
    // Based on crrev.com/c/3980425
    // Contains four comments: on a line, on a file, on the commit message, and patchset level.
    const SPECIAL_COMMENT_TYPES = (
      commitId: string
    ): api.FilePathToBaseCommentInfos => {
      return {
        '/COMMIT_MSG': [
          {
            ...COMMENT_INFO_TEMPLATE,
            id: '11f22565_49cc073f',
            line: 7,
            message: 'Commit message comment',
            commit_id: commitId,
          },
        ],
        '/PATCHSET_LEVEL': [
          {
            ...COMMENT_INFO_TEMPLATE,
            id: '413f2364_e012168b',
            updated: '2022-10-27 08:26:37.000000000',
            message: 'Patchset level comment.',
            commit_id: commitId,
          },
        ],
        'cryptohome/crypto.h': [
          {
            ...COMMENT_INFO_TEMPLATE,
            id: 'dac128a9_60677732',
            message: 'File comment.',
            commit_id: commitId,
          },
          {
            ...COMMENT_INFO_TEMPLATE,
            id: 'e5b66a14_6d8b4554',
            line: 11,
            message: 'Line comment.',
            commit_id: commitId,
          },
        ],
      };
    };

    // Create a repo with two commits:
    //   1) The first simulates cros/main.
    //   2) The second is the commit on which Gerrit review is taking place.
    const git = new testing.Git(tempDir.path);
    await git.init();
    await git.commit('First');
    await git.setupCrosBranches();
    await testing.putFiles(git.root, {
      'cryptohome/crypto.h': 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n',
    });
    await git.addAll();
    const changeId = 'Iba73f448e0da2a814f7303d1456049bb3554676e';
    const reviewCommitId = await git.commit(
      `Under review\nChange-Id: ${changeId}`
    );
    const amendedCommitId = await git.commit(
      `Under review with local amend\nChange-Id: ${changeId}`,
      {amend: true}
    );

    const gerrit = new Gerrit(
      state.outputChannel,
      state.statusBarItem,
      new bgTaskStatus.TEST_ONLY.StatusManagerImpl()
    );
    subscriptions.push(gerrit);

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: CHANGE_INFO(changeId, [reviewCommitId]),
      comments: SPECIAL_COMMENT_TYPES(reviewCommitId),
    });

    await expectAsync(
      gerrit.showChanges(abs('cryptohome/crypto.h'))
    ).toBeResolved();

    const threads = threadsSortedByFirstCommentBody(state.commentController);
    expect(threads.length).toEqual(4);

    expect(threads[0].uri).toEqual(
      vscode.Uri.parse(
        `gitmsg://${git.root}/COMMIT MESSAGE?${amendedCommitId}#gerrit commit msg`
      )
    );

    // Gerrit returns line 7, but our virtual documents don't have some headers,
    // so we shift the message by 6 lines and convert it to 0-based.
    expect(threads[0].range.start.line).toEqual(0);
    expect(threads[0].comments[0].body).toEqual(
      new vscode.MarkdownString('Commit message comment')
    );

    expect(threads[1].uri.fsPath).toEqual(abs('cryptohome/crypto.h'));
    // File comments should always be shown on the first line.
    expect(threads[1].range.start.line).toEqual(0);
    expect(threads[1].comments[0].body).toEqual(
      new vscode.MarkdownString('File comment.')
    );

    expect(threads[2].uri.fsPath).toEqual(abs('cryptohome/crypto.h'));
    // No shift, but we convert 1-based to 0-based.
    expect(threads[2].range.start.line).toEqual(10);
    expect(threads[2].comments[0].body).toEqual(
      new vscode.MarkdownString('Line comment.')
    );

    expect(threads[3].uri).toEqual(
      vscode.Uri.parse(`gerrit://${git.root}/PATCHSET_LEVEL?${changeId}`)
    );
    // Patchset level comments should always be shown on the first line.
    expect(threads[3].range.start.line).toEqual(0);
    expect(threads[3].comments[0].body).toEqual(
      new vscode.MarkdownString('Patchset level comment.')
    );

    expect(state.statusBarItem.show).toHaveBeenCalled();
    expect(state.statusBarItem.hide).not.toHaveBeenCalled();
    expect(state.statusBarItem.text).toEqual('$(comment) 4');
    expect(metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'gerrit',
      action: 'update comments',
      value: 4,
    });
  });

  // Tests, that when a Gerrit change contains multiple patchsets,
  // comments from distinct patchsets are repositioned correctly.
  //
  // To test a single aspect of the algorithm (handling multiple patchsets),
  // the comments do not overlap with changes. This way changes to
  // the repositioning algorithm will not affect this test.
  it('repositions comments from two patch sets', async () => {
    // Create a file that we'll be changing.
    const git = new testing.Git(tempDir.path);
    await git.init();
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc':
        'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\n' +
        'Line 7\n' +
        'Line 8\nLine 9\nLine 10\nLine 11\nLine 12\nLine 13\nLine 14\nLine 15\n',
    });
    await git.addAll();
    await git.commit('Initial file');
    await git.setupCrosBranches();

    const changeId = 'I6adb56bd6f1998dde6b24af26881095292ac2620';

    // First review patchset.
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc':
        'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\n' +
        'ADDED 1.1\nADDED 1.2\nLine 7\n' +
        'Line 8\nLine 9\nLine 10\nLine 11\nLine 12\nLine 13\nLine 14\nLine 15\n',
    });
    const commitId1 = await git.commit(`Change\nChange-Id: ${changeId}\n`, {
      all: true,
    });

    // Second review patchset.
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc':
        'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\n' +
        'ADDED 1.1\nADDED 1.2\nLine 7\nADDED 2.1\nADDED 2.2\n' +
        'Line 8\nLine 9\nLine 10\nLine 11\nLine 12\nLine 13\nLine 14\nLine 15\n',
    });
    const commitId2 = await git.commit(`Amended\nChange-Id: ${changeId}\n`, {
      amend: true,
      all: true,
    });

    const gerrit = new Gerrit(
      state.outputChannel,
      state.statusBarItem,
      new bgTaskStatus.TEST_ONLY.StatusManagerImpl()
    );
    subscriptions.push(gerrit);

    const fileName = abs('cryptohome/cryptohome.cc');

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: CHANGE_INFO(changeId, [commitId1, commitId2]),
      comments: TWO_PATCHSETS_COMMENT_INFOS_MAP(commitId1, commitId2),
    });

    await expectAsync(gerrit.showChanges(fileName)).toBeResolved();

    const threads = threadsSortedByFirstCommentBody(state.commentController);
    expect(threads.length).toEqual(2);

    expect(threads[0].uri.fsPath).toEqual(abs('cryptohome/cryptohome.cc'));
    // The original comment is on line 15. It is shifted by 2 lines (+2)
    // and represented in zero-based (-1).
    expect(threads[0].range.start.line).toEqual(16);
    expect(threads[0].comments[0].body).toEqual(
      new vscode.MarkdownString('Comment on termios')
    );

    expect(threads[1].uri.fsPath).toEqual(abs('cryptohome/cryptohome.cc'));
    // The comment on the second patchset stays on line 18,
    // but we convert 1-based number to 0-based.
    expect(threads[1].range.start.line).toEqual(17);
    expect(threads[1].comments[0].body).toEqual(
      new vscode.MarkdownString('Comment on unistd')
    );

    expect(state.statusBarItem.show).toHaveBeenCalled();
    expect(state.statusBarItem.hide).not.toHaveBeenCalled();
    expect(state.statusBarItem.tooltip).toEqual(
      'Gerrit comments: 1 unresolved (2 total)'
    );
    expect(state.statusBarItem.text).toEqual('$(comment) 1');
  });

  it('shows all comments in a chain', async () => {
    const git = new testing.Git(tempDir.path);
    await git.init();
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc': `Line 1
          Line 2
          Line 3
          Line 4
          Line 5
          Line 6
          Line 7
          Line 8`,
    });
    await git.commit('Merged');
    await git.setupCrosBranches();

    // First commit in a chain.
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc': `Line 1
          Line 2
          ADD-1
          Line 3
          Line 4
          Line 5`,
    });
    await git.addAll();
    const changeId1 = 'I23f50ecfe44ee28972aa640e1fa82ceabcc706a8';
    const commitId1 = await git.commit(
      `First uploaded\nChange-Id: ${changeId1}`
    );

    // Second commit in a chain.
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc': `Line 1
          Line 2
          ADD-1
          Line 3
          Line 4
          ADD-2
          Line 5`,
    });
    await git.addAll();
    const changeId2 = 'Iecc86ab5691709978e6b171795c95e538aec1a47';
    const commitId2 = await git.commit(
      `Second uploaded\nChange-Id: ${changeId2}`
    );

    const gerrit = new Gerrit(
      state.outputChannel,
      state.statusBarItem,
      new bgTaskStatus.TEST_ONLY.StatusManagerImpl()
    );
    subscriptions.push(gerrit);

    FakeGerrit.initialize()
      .setChange({
        id: changeId1,
        info: CHANGE_INFO(changeId1, [commitId1]),
        comments: SIMPLE_COMMENT_INFOS_MAP(commitId1),
      })
      .setChange({
        id: changeId2,
        info: CHANGE_INFO(changeId2, [commitId2]),
        comments: SECOND_COMMIT_IN_CHAIN(commitId2),
      });

    await expectAsync(
      gerrit.showChanges(abs('cryptohome/cryptohome.cc'))
    ).toBeResolved();

    const threads = threadsSortedByFirstCommentBody(state.commentController);
    expect(threads.length).toEqual(2);

    expect(threads[0].uri.fsPath).toMatch(/cryptohome\/cryptohome.cc/);
    // The comment in the second Gerrit change is on line 6,
    // but we convert 1-based number (Gerrit) to 0-based (VScode).
    // There are no local modification that require shifting the comment.
    expect(threads[0].range.start.line).toEqual(5);
    expect(threads[0].comments[0].body).toEqual(
      new vscode.MarkdownString('Comment on the second change')
    );

    expect(threads[1].uri.fsPath).toMatch(/cryptohome\/cryptohome.cc/);
    // The comment in the second Gerrit change is on line 3,
    // but we convert 1-based number (Gerrit) to 0-based (VScode).
    // The second Gerrit change affects lines below this change,
    // so shifting is not needed.
    expect(threads[1].range.start.line).toEqual(2);
    expect(threads[1].comments[0].body).toEqual(
      new vscode.MarkdownString('Unresolved comment on the added line.')
    );

    expect(state.statusBarItem.show).toHaveBeenCalled();
    expect(state.statusBarItem.hide).not.toHaveBeenCalled();
    expect(state.statusBarItem.text).toEqual('$(comment) 2');
    expect(metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'gerrit',
      action: 'update comments',
      value: 2,
    });
  });

  it('positions comments on valid line nubers', async () => {
    const git = new testing.Git(tempDir.path);
    await git.init();
    await git.commit('Mainline');
    await git.setupCrosBranches();
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc': 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n',
    });
    await git.addAll();
    const changeId = 'I23f50ecfe44ee28972aa640e1fa82ceabcc706a8';
    const commitId = await git.commit(`Under review\nChange-Id: ${changeId}`);
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc': 'Line 4\nLine 5\n',
    });

    const gerrit = new Gerrit(
      state.outputChannel,
      state.statusBarItem,
      state.statusManager
    );
    subscriptions.push(gerrit);

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: CHANGE_INFO(changeId, [commitId]),
      comments: SIMPLE_COMMENT_INFOS_MAP(commitId),
    });

    await expectAsync(
      gerrit.showChanges(abs('cryptohome/cryptohome.cc'))
    ).toBeResolved();

    const threads = threadsSortedByFirstCommentBody(state.commentController);
    expect(threads.length).toEqual(1);
    expect(threads[0].uri.fsPath).toEqual(abs('cryptohome/cryptohome.cc'));
    // The comment was on line 3 (1-based) and the first three lines were deleted.
    // It should be placed on line 0 (0-based).
    expect(threads[0].range.start.line).toEqual(0);
    expect(threads[0].comments[0].body).toEqual(
      new vscode.MarkdownString('Unresolved comment on the added line.')
    );
  });

  it('does not throw errors when the change is not in Gerrit', async () => {
    const git = new testing.Git(tempDir.path);
    await git.init();
    await git.commit('First');
    await git.setupCrosBranches();
    const changeId = 'Iaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    await git.commit(`Second\nChange-Id: ${changeId}`);

    const gerrit = new Gerrit(
      state.outputChannel,
      state.statusBarItem,
      state.statusManager
    );
    subscriptions.push(gerrit);

    FakeGerrit.initialize().setChange({
      id: changeId,
    });

    await expectAsync(
      gerrit.showChanges(abs('cryptohome/cryptohome.cc'))
    ).toBeResolved();

    expect(state.commentController.threads.length).toEqual(0);

    expect(state.statusBarItem.show).not.toHaveBeenCalled();
    expect(state.statusBarItem.hide).toHaveBeenCalled();
    expect(metrics.send).not.toHaveBeenCalled();
    expect(state.statusManager.setStatus).not.toHaveBeenCalled();
  });

  it('displays a comment for an internal repo', async () => {
    // Create a repo with two commits:
    //   1) The first simulates cros-internal/main.
    //   2) The second is the commit on which Gerrit review is taking place.
    const git = new testing.Git(tempDir.path);
    await git.init({repoId: 'cros-internal'});
    await git.commit('First');
    await git.setupCrosBranches({internal: true});
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc': 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n',
    });
    await git.addAll();
    const changeId = 'I23f50ecfe44ee28972aa640e1fa82ceabcc706a8';
    const commitId = await git.commit(`Second\nChange-Id: ${changeId}`);

    const gerrit = new Gerrit(
      state.outputChannel,
      state.statusBarItem,
      state.statusManager
    );
    subscriptions.push(gerrit);

    FakeGerrit.initialize({internal: true}).setChange({
      id: changeId,
      info: CHANGE_INFO(changeId, [commitId]),
      comments: SIMPLE_COMMENT_INFOS_MAP(commitId),
    });

    await expectAsync(
      gerrit.showChanges(abs('cryptohome/cryptohome.cc'))
    ).toBeResolved();

    const threads = threadsSortedByFirstCommentBody(state.commentController);
    expect(threads.length).toEqual(1);
    expect(threads[0].uri.fsPath).toEqual(abs('cryptohome/cryptohome.cc'));
    expect(threads[0].range.start.line).toEqual(2);
    expect(threads[0].comments[0].body).toEqual(
      new vscode.MarkdownString('Unresolved comment on the added line.')
    );

    expect(state.statusBarItem.show).toHaveBeenCalled();
    expect(state.statusBarItem.hide).not.toHaveBeenCalled();
    expect(state.statusBarItem.text).toEqual('$(comment) 1');
    expect(metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'gerrit',
      action: 'update comments',
      value: 1,
    });
    expect(state.statusManager.setStatus).not.toHaveBeenCalled();
  });

  it('does not throw errors when repositioning is triggered outside a Git repo', async () => {
    registerFakeCommentController(vscodeSpy);
    const gerrit = new Gerrit(
      state.outputChannel,
      state.statusBarItem,
      state.statusManager
    );
    subscriptions.push(gerrit);

    await expectAsync(gerrit.showChanges(tempDir.path)).toBeResolved();

    expect(state.statusManager.setStatus).not.toHaveBeenCalled();
  });

  it('shows a specific error when a commit is not available locally', async () => {
    const git = new testing.Git(tempDir.path);
    await git.init();
    await git.commit('Mainline');
    await git.setupCrosBranches();
    await git.addAll();
    const changeId = 'Iaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa12345';
    const commitId1 = await git.commit(`Under review\nChange-Id: ${changeId}`);
    const commitId2 = '1111111111111111111111111111111111111111';

    const gerrit = new Gerrit(
      state.outputChannel,
      state.statusBarItem,
      state.statusManager
    );
    subscriptions.push(gerrit);

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: CHANGE_INFO(changeId, [commitId1, commitId2]),
      comments: TWO_PATCHSETS_COMMENT_INFOS_MAP(commitId1, commitId2),
    });

    await expectAsync(
      gerrit.showChanges(abs('cryptohome/cryptohome.cc'))
    ).toBeResolved();

    const threads = threadsSortedByFirstCommentBody(state.commentController);
    expect(threads.length).toEqual(2);

    expect(threads[0].uri.fsPath).toEqual(abs('cryptohome/cryptohome.cc'));
    // The comment is on line 15 and there are no local changes.
    expect(threads[0].range.start.line).toEqual(14);
    expect(threads[0].comments[0].body).toEqual(
      new vscode.MarkdownString('Comment on termios')
    );

    expect(threads[1].uri.fsPath).toEqual(abs('cryptohome/cryptohome.cc'));
    expect(threads[1].range.start.line).toEqual(17);
    expect(threads[1].comments[0].body).toEqual(
      new vscode.MarkdownString('Comment on unistd')
    );

    expect(state.statusBarItem.show).toHaveBeenCalled();
    expect(state.statusBarItem.hide).not.toHaveBeenCalled();
    expect(state.statusBarItem.tooltip).toEqual(
      'Gerrit comments: 1 unresolved (2 total)'
    );
    expect(state.statusBarItem.text).toEqual('$(comment) 1');

    expect(metrics.send).toHaveBeenCalledTimes(2);
    expect(metrics.send).toHaveBeenCalledWith({
      category: 'error',
      group: 'gerrit',
      description: '(warning) commit not available locally',
    });
    expect(metrics.send).toHaveBeenCalledWith({
      category: 'background',
      group: 'gerrit',
      action: 'update comments',
      value: 2,
    });
    expect(state.statusManager.setStatus).not.toHaveBeenCalled();
  });

  it('reports unexpected errors', async () => {
    const user = os.userInfo().username;

    const internalError = new Error(
      `${user} saw a test error while editing /home/${user}/hello/world.php`
    );

    registerFakeCommentController(vscodeSpy);
    const gerrit = new Gerrit(
      state.outputChannel,
      state.statusBarItem,
      state.statusManager
    );
    subscriptions.push(gerrit);

    await expectAsync(
      gerrit.showChanges(abs('cryptohome/cryptohome.cc'), true, internalError)
    ).toBeResolved();

    expect(state.statusManager.setStatus).toHaveBeenCalledOnceWith(
      'Gerrit',
      TaskStatus.ERROR
    );
    expect(metrics.send).toHaveBeenCalledWith({
      category: 'error',
      group: 'gerrit',
      description:
        'Failed to show Gerrit changes (top-level): ' +
        'Error: ${USER} saw a test error while editing /home/${USER}/hello/world.php',
    });
  });
});

function threadsSortedByFirstCommentBody(
  commentController: FakeCommentController
): readonly vscode.CommentThread[] {
  return [...commentController.threads].sort((a, b) =>
    (a.comments[0].body as vscode.MarkdownString).value.localeCompare(
      (b.comments[0].body as vscode.MarkdownString).value
    )
  );
}

function registerFakeCommentController(vscodeSpy: {
  comments: jasmine.SpyObj<typeof vscode.comments>;
}): FakeCommentController {
  const commentController = new FakeCommentController();
  vscodeSpy.comments.createCommentController.and.returnValue(commentController);
  return commentController;
}
