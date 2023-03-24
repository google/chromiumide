// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as gerrit from '../../../../features/gerrit/gerrit';
import {
  FETCH_THROTTLE_INTERVAL_MILLIS,
  POLL_INTERVAL_MILLIS,
} from '../../../../features/gerrit/model/gerrit_comments';
import * as metrics from '../../../../features/metrics/metrics';
import {GitDirsWatcher} from '../../../../services';
import {TaskStatus} from '../../../../ui/bg_task_status';
import * as testing from '../../../testing';
import {FakeStatusManager, VoidOutputChannel} from '../../../testing/fakes';
import {FakeCommentController} from '../../../testing/fakes/comment_controller';
import {
  AUTHOR,
  changeInfo,
  resolvedCommentInfo,
  unresolvedCommentInfo,
} from './fake_data';
import {FakeGerrit} from './fake_env';

const GITCOOKIES_PATH = path.join(
  __dirname,
  '../../../../../src/test/testdata/gerrit/gitcookies'
);

describe('Gerrit', () => {
  const tempDir = testing.tempDir();

  function abs(relative: string) {
    return path.join(tempDir.path, relative);
  }

  const subscriptions: vscode.Disposable[] = [];

  beforeEach(() => {
    jasmine.clock().install();

    spyOn(metrics, 'send');

    process.env.GIT_COOKIES_PATH = GITCOOKIES_PATH;
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    jasmine.clock().mockDate(new Date());

    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.length = 0;
  });

  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();

  const state = testing.cleanState(() => {
    const state = {
      statusBarItem: jasmine.createSpyObj<vscode.StatusBarItem>(
        'statusBarItem',
        ['hide', 'show']
      ),
      commentController: new FakeCommentController(),
      outputChannel: new VoidOutputChannel(),
      statusManager: new FakeStatusManager(),
    };

    vscodeSpy.comments.createCommentController.and.returnValue(
      state.commentController
    );
    vscodeSpy.commands.registerCommand.and.returnValue(
      vscode.Disposable.from()
    );

    vscodeSpy.window.createOutputChannel.and.returnValue(state.outputChannel);
    vscodeSpy.window.createStatusBarItem.and.returnValue(state.statusBarItem);

    vscodeSpy.workspace.registerTextDocumentContentProvider.and.returnValue(
      vscode.Disposable.from()
    );
    return state;
  });

  it('displays a comment', async () => {
    // Create a repo with two commits:
    //   1) The first simulates cros/main.
    //   2) The second is the commit on which Gerrit review is taking place.
    const git = new testing.Git(tempDir.path);

    const changeId = 'I23f50ecfe44ee28972aa640e1fa82ceabcc706a8';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init();
        await git.commit('First');
        await git.setupCrosBranches();
        await testing.putFiles(git.root, {
          'cryptohome/cryptohome.cc':
            'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n',
        });
        await git.addAll();
        await git.commit(`Second\nChange-Id: ${changeId}`);
      },
      'gerrit_display_a_comment'
    );

    const commitId = await git.getCommitId();

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: changeInfo(changeId, [commitId]),
      comments: {
        'cryptohome/cryptohome.cc': [
          unresolvedCommentInfo({
            line: 3,
            message: 'Unresolved comment on the added line.',
            commitId,
          }),
        ],
      },
    });

    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const cryptohomeFilePath = abs('cryptohome/cryptohome.cc');
    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.poll(FETCH_THROTTLE_INTERVAL_MILLIS);

    const threads = state.commentController.threads;
    expect(threads.length).toEqual(1);
    expect(threads[0].uri.fsPath).toEqual(cryptohomeFilePath);
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
    expect(state.statusManager.getStatus('Gerrit')).toEqual(TaskStatus.OK);
  });

  it('displays a draft comment', async () => {
    // Create a repo with two commits:
    //   1) The first simulates cros/main.
    //   2) The second is the commit on which Gerrit review is taking place.
    const git = new testing.Git(tempDir.path);

    const cryptohomeFilePath = abs('cryptohome/cryptohome.cc');
    const changeId = 'I23f50ecfe44ee28972aa640e1fa82ceabcc706a8';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init();
        await git.commit('First');
        await git.setupCrosBranches();
        await testing.putFiles(git.root, {
          'cryptohome/cryptohome.cc':
            'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n',
        });

        await git.addAll();
        await git.commit(`Second\nChange-Id: ${changeId}`);
      },
      'gerrit_displays_a_draft_comment'
    );

    const commitId = await git.getCommitId();

    const firstComment = unresolvedCommentInfo({
      line: 3,
      message: 'Unresolved comment on the added line.',
      commitId,
    });
    const draftReplyComment = unresolvedCommentInfo({
      line: 3,
      message: 'Draft reply.',
      commitId,
      inReplyTo: firstComment.id,
      updated: '2022-10-13 05:43:50.000000000',
    });

    FakeGerrit.initialize({accountsMe: AUTHOR}).setChange({
      id: changeId,
      info: changeInfo(changeId, [commitId]),
      comments: {
        'cryptohome/cryptohome.cc': [firstComment],
      },
      drafts: {
        'cryptohome/cryptohome.cc': [draftReplyComment],
      },
    });

    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.poll(FETCH_THROTTLE_INTERVAL_MILLIS);

    const threads = state.commentController.threads;
    expect(threads.length).toEqual(1);
    expect(threads[0].uri.fsPath).toEqual(cryptohomeFilePath);
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
    expect(state.statusManager.getStatus('Gerrit')).toEqual(TaskStatus.OK);
  });

  it('handles special comment types (line, file, commit msg, patchset)', async () => {
    // Create a repo with two commits:
    //   1) The first simulates cros/main.
    //   2) The second is the commit on which Gerrit review is taking place.
    const git = new testing.Git(tempDir.path);

    const changeId = 'Iba73f448e0da2a814f7303d1456049bb3554676e';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init();
        await git.commit('First');
        await git.setupCrosBranches();
        await testing.putFiles(git.root, {
          'cryptohome/crypto.h': 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n',
        });
        await git.addAll();
        await git.commit(`Under review\nChange-Id: ${changeId}`);
        await git.commit(
          `Under review with local amend\nChange-Id: ${changeId}`,
          {amend: true}
        );
      },
      'gerrit_handles_special_comment_types'
    );

    const reviewCommitId = await git.getCommitId('HEAD@{1}');
    const amendedCommitId = await git.getCommitId();

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: changeInfo(changeId, [reviewCommitId]),
      // Based on crrev.com/c/3980425
      // Contains four comments: on a line, on a file, on the commit message, and patchset level.
      comments: {
        '/COMMIT_MSG': [
          unresolvedCommentInfo({
            line: 7,
            message: 'Commit message comment',
            commitId: reviewCommitId,
          }),
        ],
        '/PATCHSET_LEVEL': [
          unresolvedCommentInfo({
            updated: '2022-10-27 08:26:37.000000000',
            message: 'Patchset level comment.',
            commitId: reviewCommitId,
          }),
        ],
        'cryptohome/crypto.h': [
          unresolvedCommentInfo({
            message: 'File comment.',
            commitId: reviewCommitId,
          }),
          unresolvedCommentInfo({
            line: 11,
            message: 'Line comment.',
            commitId: reviewCommitId,
          }),
        ],
      },
    });

    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    // Document provider for patch set level comments must be registered.
    expect(
      vscodeSpy.workspace.registerTextDocumentContentProvider.calls.first()
        .args[0]
    ).toEqual('gerrit');

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const cryptohomeFilePath = abs('cryptohome/crypto.h');
    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.poll(FETCH_THROTTLE_INTERVAL_MILLIS);

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

    expect(threads[1].uri.fsPath).toEqual(cryptohomeFilePath);
    // File comments should always be shown on the first line.
    expect(threads[1].range.start.line).toEqual(0);
    expect(threads[1].comments[0].body).toEqual(
      new vscode.MarkdownString('File comment.')
    );

    expect(threads[2].uri.fsPath).toEqual(cryptohomeFilePath);
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

    const changeId = 'I6adb56bd6f1998dde6b24af26881095292ac2620';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
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

        // First review patchset.
        await testing.putFiles(git.root, {
          'cryptohome/cryptohome.cc':
            'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\n' +
            'ADDED 1.1\nADDED 1.2\nLine 7\n' +
            'Line 8\nLine 9\nLine 10\nLine 11\nLine 12\nLine 13\nLine 14\nLine 15\n',
        });
        await git.commit(`Change\nChange-Id: ${changeId}\n`, {
          all: true,
        });
        // Second review patchset.
        await testing.putFiles(git.root, {
          'cryptohome/cryptohome.cc':
            'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\n' +
            'ADDED 1.1\nADDED 1.2\nLine 7\nADDED 2.1\nADDED 2.2\n' +
            'Line 8\nLine 9\nLine 10\nLine 11\nLine 12\nLine 13\nLine 14\nLine 15\n',
        });
        await git.commit(`Amended\nChange-Id: ${changeId}\n`, {
          amend: true,
          all: true,
        });
      },
      'gerrit_repositions_comments_from_two_patch_sets'
    );

    const commitId1 = await git.getCommitId('HEAD@{1}');
    const commitId2 = await git.getCommitId();

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: changeInfo(changeId, [commitId1, commitId2]),
      comments: {
        'cryptohome/cryptohome.cc': [
          unresolvedCommentInfo({
            line: 15,
            message: 'Comment on termios',
            commitId: commitId1,
          }),
          resolvedCommentInfo({
            line: 18,
            message: 'Comment on unistd',
            commitId: commitId2,
          }),
        ],
      },
    });

    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const cryptohomeFilePath = abs('cryptohome/cryptohome.cc');
    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.poll(FETCH_THROTTLE_INTERVAL_MILLIS);

    const threads = threadsSortedByFirstCommentBody(state.commentController);
    expect(threads.length).toEqual(2);

    expect(threads[0].uri.fsPath).toEqual(cryptohomeFilePath);
    // The original comment is on line 15. It is shifted by 2 lines (+2)
    // and represented in zero-based (-1).
    expect(threads[0].range.start.line).toEqual(16);
    expect(threads[0].comments[0].body).toEqual(
      new vscode.MarkdownString('Comment on termios')
    );

    expect(threads[1].uri.fsPath).toEqual(cryptohomeFilePath);
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

  it('repositions comments on file save', async () => {
    // Create a file that we'll be changing.
    const git = new testing.Git(tempDir.path);

    const changeId = 'I123';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init();
        await git.commit('Mainline');
        await git.setupCrosBranches();

        // First review patchset.
        await testing.putFiles(git.root, {
          'foo.cc': 'A\nB',
        });
        await git.addAll();
        await git.commit(`A and B\nChange-Id: ${changeId}\n`, {
          all: true,
        });
      },
      'gerrit_repositions_comments_on_file_save'
    );

    const commitId = await git.getCommitId();

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: changeInfo(changeId, [commitId]),
      comments: {
        'foo.cc': [
          // Comment on B
          unresolvedCommentInfo({
            line: 2,
            message: 'Hello',
            commitId,
          }),
        ],
      },
    });

    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const fooFilePath = abs('foo.cc');

    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(fooFilePath),
      fileName: fooFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.poll(FETCH_THROTTLE_INTERVAL_MILLIS);

    expect(state.commentController.threads[0].range.start.line).toEqual(1);

    await testing.putFiles(tempDir.path, {
      'foo.cc': 'A\nC\nB',
    });

    vscodeEmitters.workspace.onDidSaveTextDocument.fire({
      uri: vscode.Uri.file(fooFilePath),
      fileName: fooFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.read();

    expect(state.commentController.threads[0].range.start.line).toEqual(2);
  });

  it('polls remote changes', async () => {
    const git = new testing.Git(tempDir.path);

    const changeId = 'I123';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init();
        await git.commit('Mainline');
        await git.setupCrosBranches();

        await testing.putFiles(git.root, {
          'foo.cc': 'A\nB',
        });
        await git.addAll();
        await git.commit(`A and B\nChange-Id: ${changeId}\n`, {
          all: true,
        });
      },
      'gerrit_poll_remote_changes'
    );

    const commitId = await git.getCommitId();

    const fakeGerrit = FakeGerrit.initialize().setChange({
      id: changeId,
      info: changeInfo(changeId, [commitId]),
      comments: {},
    });

    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const fooFilePath = abs('foo.cc');

    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(fooFilePath),
      fileName: fooFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.poll(FETCH_THROTTLE_INTERVAL_MILLIS);

    expect(state.commentController.threads.length).toEqual(0);

    fakeGerrit.setChange({
      id: changeId,
      info: changeInfo(changeId, [commitId]),
      comments: {
        'foo.cc': [
          unresolvedCommentInfo({
            line: 2,
            message: 'Hello',
            commitId,
          }),
        ],
      },
    });

    jasmine.clock().tick(POLL_INTERVAL_MILLIS * 1.5);

    await completeShowChangeEvents.read();

    expect(state.commentController.threads.length).toEqual(1);
  });

  it('shows all comments in a chain', async () => {
    const git = new testing.Git(tempDir.path);

    const changeId1 = 'I23f50ecfe44ee28972aa640e1fa82ceabcc706a8';
    const changeId2 = 'Iecc86ab5691709978e6b171795c95e538aec1a47';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
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
        await git.commit(`First uploaded\nChange-Id: ${changeId1}`);

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
        await git.commit(`Second uploaded\nChange-Id: ${changeId2}`);
      },
      'gerrit_shows_all_comments_in_a_chain'
    );

    const commitId1 = await git.getCommitId('HEAD@{1}');
    const commitId2 = await git.getCommitId();

    FakeGerrit.initialize()
      .setChange({
        id: changeId1,
        info: changeInfo(changeId1, [commitId1]),
        comments: {
          'cryptohome/cryptohome.cc': [
            unresolvedCommentInfo({
              line: 3,
              message: 'Unresolved comment on the added line.',
              commitId: commitId1,
            }),
          ],
        },
      })
      .setChange({
        id: changeId2,
        info: changeInfo(changeId2, [commitId2]),
        comments: {
          'cryptohome/cryptohome.cc': [
            unresolvedCommentInfo({
              line: 6,
              message: 'Comment on the second change',
              commitId: commitId2,
            }),
          ],
        },
      });

    gerrit.activate(
      new FakeStatusManager(),
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const cryptohomeFilePath = abs('cryptohome/cryptohome.cc');
    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.poll(FETCH_THROTTLE_INTERVAL_MILLIS);

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

  it('positions comments on valid line numbers', async () => {
    const git = new testing.Git(tempDir.path);

    const changeId = 'I23f50ecfe44ee28972aa640e1fa82ceabcc706a8';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init();
        await git.commit('Mainline');
        await git.setupCrosBranches();
        await testing.putFiles(git.root, {
          'cryptohome/cryptohome.cc':
            'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n',
        });
        await git.addAll();
        await git.commit(`Under review\nChange-Id: ${changeId}`);
        await testing.putFiles(git.root, {
          'cryptohome/cryptohome.cc': 'Line 4\nLine 5\n',
        });
      },
      'gerrit_positions_comments_on_valid_line_numbers'
    );

    const commitId = await git.getCommitId();

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: changeInfo(changeId, [commitId]),
      comments: {
        'cryptohome/cryptohome.cc': [
          unresolvedCommentInfo({
            line: 3,
            message: 'Unresolved comment on the added line.',
            commitId: commitId,
          }),
        ],
      },
    });

    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const cryptohomeFilePath = abs('cryptohome/cryptohome.cc');
    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.poll(FETCH_THROTTLE_INTERVAL_MILLIS);

    const threads = threadsSortedByFirstCommentBody(state.commentController);
    expect(threads.length).toEqual(1);
    expect(threads[0].uri.fsPath).toEqual(cryptohomeFilePath);
    // The comment was on line 3 (1-based) and the first three lines were deleted.
    // It should be placed on line 0 (0-based).
    expect(threads[0].range.start.line).toEqual(0);
    expect(threads[0].comments[0].body).toEqual(
      new vscode.MarkdownString('Unresolved comment on the added line.')
    );
  });

  it('does not throw errors when the change is not in Gerrit', async () => {
    const git = new testing.Git(tempDir.path);

    const changeId = 'Iaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init();
        await git.commit('First');
        await git.setupCrosBranches();
        await git.commit(`Second\nChange-Id: ${changeId}`);
      },
      'gerrit_does_not_throw_errors_when_the_change_is_not_in_Gerrit'
    );

    FakeGerrit.initialize().setChange({
      id: changeId,
    });

    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const cryptohomeFilePath = abs('cryptohome/cryptohome.cc');
    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.poll(FETCH_THROTTLE_INTERVAL_MILLIS);

    expect(state.commentController.threads.length).toEqual(0);

    expect(state.statusBarItem.show).not.toHaveBeenCalled();
    expect(state.statusBarItem.hide).toHaveBeenCalled();
    expect(metrics.send).not.toHaveBeenCalled();
    expect(state.statusManager.getStatus('Gerrit')).toEqual(TaskStatus.OK);
  });

  it('displays a comment for an internal repo', async () => {
    // Create a repo with two commits:
    //   1) The first simulates cros-internal/main.
    //   2) The second is the commit on which Gerrit review is taking place.
    const git = new testing.Git(tempDir.path);

    const changeId = 'I23f50ecfe44ee28972aa640e1fa82ceabcc706a8';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init({repoId: 'cros-internal'});
        await git.commit('First');
        await git.setupCrosBranches({internal: true});
        await testing.putFiles(git.root, {
          'cryptohome/cryptohome.cc':
            'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n',
        });
        await git.addAll();
        await git.commit(`Second\nChange-Id: ${changeId}`);
      },
      'gerrit_displays_a_comment_for_an_internal_repo'
    );

    const commitId = await git.getCommitId();

    FakeGerrit.initialize({internal: true}).setChange({
      id: changeId,
      info: changeInfo(changeId, [commitId]),
      comments: {
        'cryptohome/cryptohome.cc': [
          unresolvedCommentInfo({
            line: 3,
            message: 'Unresolved comment on the added line.',
            commitId,
          }),
        ],
      },
    });

    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const cryptohomeFilePath = abs('cryptohome/cryptohome.cc');
    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.poll(FETCH_THROTTLE_INTERVAL_MILLIS);

    const threads = threadsSortedByFirstCommentBody(state.commentController);
    expect(threads.length).toEqual(1);
    expect(threads[0].uri.fsPath).toEqual(cryptohomeFilePath);
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
    expect(state.statusManager.getStatus('Gerrit')).toEqual(TaskStatus.OK);
  });

  it('does not throw errors when repositioning is triggered outside a Git repo', async () => {
    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const cryptohomeFilePath = abs('cryptohome/cryptohome.cc');
    vscodeEmitters.workspace.onDidSaveTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.read();

    expect(state.statusManager.getStatus('Gerrit')).toEqual(TaskStatus.OK);
  });

  it('shows a specific error when a commit is not available locally', async () => {
    const git = new testing.Git(tempDir.path);

    const changeId = 'Iaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa12345';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init();
        await git.commit('Mainline');
        await git.setupCrosBranches();
        await git.addAll();
        await git.commit(`Under review\nChange-Id: ${changeId}`);
      },
      'gerrit_shows_a_specific_error_when_a_commit_is_not_available_locally'
    );

    const commitId1 = await git.getCommitId();
    const commitId2 = '1111111111111111111111111111111111111111';

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: changeInfo(changeId, [commitId1, commitId2]),
      comments: {
        'cryptohome/cryptohome.cc': [
          unresolvedCommentInfo({
            line: 15,
            message: 'Comment on termios',
            commitId: commitId1,
          }),
          resolvedCommentInfo({
            line: 18,
            message: 'Comment on unistd',
            commitId: commitId2,
          }),
        ],
      },
    });

    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const cryptohomeFilePath = abs('cryptohome/cryptohome.cc');
    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.poll(FETCH_THROTTLE_INTERVAL_MILLIS);

    const threads = threadsSortedByFirstCommentBody(state.commentController);
    expect(threads.length).toEqual(2);

    expect(threads[0].uri.fsPath).toEqual(cryptohomeFilePath);
    // The comment is on line 15 and there are no local changes.
    expect(threads[0].range.start.line).toEqual(14);
    expect(threads[0].comments[0].body).toEqual(
      new vscode.MarkdownString('Comment on termios')
    );

    expect(threads[1].uri.fsPath).toEqual(cryptohomeFilePath);
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
    expect(state.statusManager.getStatus('Gerrit')).toEqual(TaskStatus.OK);
  });

  it('reports unexpected errors', async () => {
    const git = new testing.Git(tempDir.path);

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init();
        await git.commit('Mainline');
        await git.setupCrosBranches();
      },
      'gerrit_reports_unexpected_errors'
    );

    const user = os.userInfo().username;

    let internalError: Error | undefined = new Error(
      `${user} saw a test error while editing /home/${user}/hello/world.php`
    );

    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions,
      () => internalError
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const cryptohomeFilePath = abs('cryptohome/cryptohome.cc');
    vscodeEmitters.workspace.onDidSaveTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.read();

    expect(state.statusManager.getStatus('Gerrit')).toEqual(TaskStatus.ERROR);
    expect(metrics.send).toHaveBeenCalledWith({
      category: 'error',
      group: 'gerrit',
      description:
        'Failed to show Gerrit changes (top-level): ' +
        'Error: ${USER} saw a test error while editing /home/${USER}/hello/world.php',
    });

    internalError = undefined;

    vscodeEmitters.workspace.onDidSaveTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.read();

    expect(state.statusManager.getStatus('Gerrit')).toEqual(TaskStatus.OK);
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
