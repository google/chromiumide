// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as api from '../../../../features/gerrit/api';
import * as gerrit from '../../../../features/gerrit/gerrit';
import {POLL_INTERVAL_MILLIS} from '../../../../features/gerrit/model/gerrit_comments';
import {Metrics} from '../../../../features/metrics/metrics';
import {GitDirsWatcher} from '../../../../services';
import {TaskStatus} from '../../../../ui/bg_task_status';
import * as testing from '../../../testing';
import {FakeStatusManager, VoidOutputChannel} from '../../../testing/fakes';
import {FakeCommentController} from '../../../testing/fakes/comment_controller';
import {readPackageJson} from '../../../testing/package_json';
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

    spyOn(Metrics, 'send');

    process.env.GIT_COOKIES_PATH = GITCOOKIES_PATH;
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    jasmine.clock().mockDate(new Date());

    vscode.Disposable.from(...subscriptions.reverse()).dispose();
    subscriptions.length = 0;
  });

  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const state = testing.cleanState(async () => {
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
        await git.commit(`Second\n\nChange-Id: ${changeId}`);
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

    await completeShowChangeEvents.read();

    const threads = state.commentController.threads;
    expect(threads.length).toEqual(1);
    expect(threads[0].uri.fsPath).toEqual(cryptohomeFilePath);
    expect(threads[0].range.start.line).toEqual(2);
    expect(threads[0].canReply).toBeTrue();

    expect(threads[0].comments[0].body).toEqual(
      new vscode.MarkdownString('Unresolved comment on the added line.')
    );
    expect(threads[0].comments[0].contextValue).toEqual('<public><unresolved>');

    expect(state.statusBarItem.show).toHaveBeenCalled();
    expect(state.statusBarItem.hide).not.toHaveBeenCalled();
    expect(state.statusBarItem.text).toEqual('$(comment) 1');
    expect(Metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'gerrit',
      description: 'update comments',
      name: 'gerrit_update_comments',
      displayed_threads_count: 1,
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
        await git.commit(`Second\n\nChange-Id: ${changeId}`);
      },
      'gerrit_displays_a_draft_comment'
    );

    const commitId = await git.getCommitId();

    const firstComment = resolvedCommentInfo({
      line: 3,
      message: 'Resolved comment on the added line.',
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

    await completeShowChangeEvents.read();

    const threads = state.commentController.threads;
    expect(threads.length).toEqual(1);
    expect(threads[0].uri.fsPath).toEqual(cryptohomeFilePath);
    expect(threads[0].range.start.line).toEqual(2);
    expect(threads[0].canReply).toBeFalse(); // last comment is draft so can't reply
    expect(threads[0].contextValue).toMatch(/<public>/); // first comment is public so the thread is
    expect(threads[0].contextValue).toMatch(/<unresolved>/); // last comment is unresolved so the thread is

    const comments = threads[0].comments;
    expect(comments.length).toEqual(2);
    expect(comments[0].body).toEqual(
      new vscode.MarkdownString('Resolved comment on the added line.')
    );
    expect(comments[0].contextValue).toEqual('<public><resolved>');
    expect(comments[1].body).toEqual(new vscode.MarkdownString('Draft reply.'));
    expect(comments[1].contextValue).toEqual('<draft><unresolved>');

    expect(state.statusBarItem.show).toHaveBeenCalled();
    expect(state.statusBarItem.hide).not.toHaveBeenCalled();
    expect(state.statusBarItem.text).toEqual('$(comment) 1');
    expect(Metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'gerrit',
      description: 'update comments',
      name: 'gerrit_update_comments',
      displayed_threads_count: 1,
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
        await git.commit(`Under review\n\nChange-Id: ${changeId}`);
        await git.commit(
          `Under review with local amend\n\nChange-Id: ${changeId}`,
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

    await completeShowChangeEvents.read();

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
    expect(Metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'gerrit',
      description: 'update comments',
      name: 'gerrit_update_comments',
      displayed_threads_count: 4,
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
        await git.commit(`Change\n\nChange-Id: ${changeId}\n`, {
          all: true,
        });
        // Second review patchset.
        await testing.putFiles(git.root, {
          'cryptohome/cryptohome.cc':
            'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\n' +
            'ADDED 1.1\nADDED 1.2\nLine 7\nADDED 2.1\nADDED 2.2\n' +
            'Line 8\nLine 9\nLine 10\nLine 11\nLine 12\nLine 13\nLine 14\nLine 15\n',
        });
        await git.commit(`Amended\n\nChange-Id: ${changeId}\n`, {
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

    await completeShowChangeEvents.read();

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
        await git.commit(`A and B\n\nChange-Id: ${changeId}\n`, {
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

    await completeShowChangeEvents.read();

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
        await git.commit(`A and B\n\nChange-Id: ${changeId}\n`, {
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

    await completeShowChangeEvents.read();

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
        await git.commit(`First uploaded\n\nChange-Id: ${changeId1}`);

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
        await git.commit(`Second uploaded\n\nChange-Id: ${changeId2}`);
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

    await completeShowChangeEvents.read();

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
    expect(Metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'gerrit',
      description: 'update comments',
      name: 'gerrit_update_comments',
      displayed_threads_count: 2,
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
        await git.commit(`Under review\n\nChange-Id: ${changeId}`);
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

    await completeShowChangeEvents.read();

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
        await git.commit(`Second\n\nChange-Id: ${changeId}`);
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

    await completeShowChangeEvents.read();

    expect(state.commentController.threads.length).toEqual(0);

    expect(state.statusBarItem.show).not.toHaveBeenCalled();
    expect(state.statusBarItem.hide).toHaveBeenCalled();
    expect(Metrics.send).not.toHaveBeenCalled();
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
        await git.commit(`Second\n\nChange-Id: ${changeId}`);
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

    await completeShowChangeEvents.read();

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
    expect(Metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'gerrit',
      description: 'update comments',
      name: 'gerrit_update_comments',
      displayed_threads_count: 1,
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
        await git.commit(`Under review\n\nChange-Id: ${changeId}`);
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

    await completeShowChangeEvents.read();

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

    expect(Metrics.send).toHaveBeenCalledTimes(2);
    expect(Metrics.send).toHaveBeenCalledWith({
      category: 'error',
      group: 'gerrit',
      description: '(warning) commit not available locally',
      name: 'gerrit_show_error',
    });
    expect(Metrics.send).toHaveBeenCalledWith({
      category: 'background',
      group: 'gerrit',
      description: 'update comments',
      name: 'gerrit_update_comments',
      displayed_threads_count: 2,
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
      async () => {
        if (internalError) throw internalError;
      }
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
    expect(Metrics.send).toHaveBeenCalledWith({
      category: 'error',
      group: 'gerrit',
      description:
        'Failed to show Gerrit changes (top-level): ' +
        'Error: ${USER} saw a test error while editing /home/${USER}/hello/world.php',
      name: 'gerrit_show_error',
    });

    internalError = undefined;

    vscodeEmitters.workspace.onDidSaveTextDocument.fire({
      uri: vscode.Uri.file(cryptohomeFilePath),
      fileName: cryptohomeFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.read();

    expect(state.statusManager.getStatus('Gerrit')).toEqual(TaskStatus.OK);
  });

  it('event handling for file save is throttled', async () => {
    // Instruct event handler to always show an error after a delay.
    gerrit.activate(
      state.statusManager,
      new GitDirsWatcher('/', subscriptions),
      subscriptions,
      async () => {
        // Iterate enough times for events to be all handled.
        for (let i = 0; i < 10; i++) {
          await testing.flushMicrotasks();
        }
        throw new Error('foo');
      }
    );

    const completeShowChangeEvents = new testing.EventReader(
      gerrit.onDidHandleEventForTesting,
      subscriptions
    );

    const fooFilePath = abs('foo.cc');

    const iteration = 4;
    for (let i = 0; i < iteration; i++) {
      vscodeEmitters.workspace.onDidSaveTextDocument.fire({
        uri: vscode.Uri.file(fooFilePath),
        fileName: fooFilePath,
      } as vscode.TextDocument);
    }

    for (let i = 0; i < iteration; i++) {
      await completeShowChangeEvents.read();
    }

    // Error is reported only two times, because all but the first and last
    // events are ignored.
    expect(Metrics.send).toHaveBeenCalledTimes(2);
  });

  it('shifts comments correctly', async () => {
    const git = new testing.Git(tempDir.path);

    const changeId = 'I123';

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init();
        await git.commit('Mainline');
        await git.setupCrosBranches();

        await testing.putFiles(tempDir.path, {
          // 9 lines
          'foo.txt': 'A\nB\nC\nD\nE\nF\nG\nH\nI\n',
          'bar.txt': 'A\nB\n',
          'baz.txt': `1
2
3
4
`,
        });
        await git.addAll();
        await git.commit(`foobar\n\nChange-Id: ${changeId}`);
      },
      'gerrit_shifts_comments_correctly'
    );

    const commitId = await git.getCommitId();

    await testing.putFiles(tempDir.path, {
      // First line added.
      // Third line removed.
      // Fifth line modified, sixth to seventh line removed.
      'foo.txt': `X
A
B
D
X
H
I
`,
      // First line added.
      'bar.txt': `X
A
B
`,
      'baz.txt': `1
ADD
2
ADD
3
ADD
4
`,
    });

    const range = (
      start_line: number,
      start_character: number,
      end_line: number,
      end_character: number
    ): api.CommentRange => {
      return {
        start_line,
        start_character,
        end_line,
        end_character,
      };
    };

    FakeGerrit.initialize().setChange({
      id: changeId,
      info: changeInfo(changeId, [commitId]),
      comments: {
        'foo.txt': [
          unresolvedCommentInfo({
            message: 'case 00 - comment on a file',
            commitId,
          }),
          unresolvedCommentInfo({
            message: 'case 01 - comment on characters',
            range: range(1, 1, 1, 2),
            line: 1,
            commitId,
          }),
          unresolvedCommentInfo({
            message: 'case 02 - comment on a line',
            line: 1,
            commitId,
          }),
          unresolvedCommentInfo({
            message: 'case 03 - comment on a removed line',
            line: 3,
            commitId,
          }),
          unresolvedCommentInfo({message: 'case 04', line: 4, commitId}),
          unresolvedCommentInfo({
            message: 'case 05 - comment in a removed hunk',
            line: 5,
            commitId,
          }),
          unresolvedCommentInfo({message: 'case 06', line: 7, commitId}),
          unresolvedCommentInfo({message: 'case 07', line: 8, commitId}),
          unresolvedCommentInfo({
            message: 'case 08 - comment across multiple hunks',
            range: range(3, 1, 6, 2),
            line: 3,
            commitId,
          }),
        ],
        'bar.txt': [
          unresolvedCommentInfo({
            message: 'case 09 - bar',
            line: 1,
            commitId,
          }),
        ],
        'baz.txt': [
          unresolvedCommentInfo({
            message: 'case 10 - one',
            line: 1,
            commitId,
          }),
          unresolvedCommentInfo({
            message: 'case 11 - two',
            line: 2,
            commitId,
          }),
          unresolvedCommentInfo({
            message: 'case 12 - three',
            line: 3,
            commitId,
          }),
          unresolvedCommentInfo({
            message: 'case 13 - four',
            line: 4,
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

    const fooFilePath = abs('foo.txt');
    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(fooFilePath),
      fileName: fooFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.read();

    const threads = threadsSortedByFirstCommentBody(state.commentController);

    // foo.txt
    expect(threads[0].range).toEqual(new vscode.Range(0, 0, 0, 0));
    expect(threads[1].range).toEqual(new vscode.Range(1, 1, 1, 2));
    expect(threads[2].range).toEqual(new vscode.Range(1, 0, 1, 0));
    expect(threads[3].range).toEqual(new vscode.Range(2, 0, 2, 0));
    expect(threads[4].range).toEqual(new vscode.Range(3, 0, 3, 0));
    expect(threads[5].range).toEqual(new vscode.Range(4, 0, 4, 0));
    expect(threads[6].range).toEqual(new vscode.Range(4, 0, 4, 0));
    expect(threads[7].range).toEqual(new vscode.Range(5, 0, 5, 0));
    expect(threads[8].range).toEqual(new vscode.Range(2, 1, 5, 2));
    // bar.txt
    expect(threads[9].range).toEqual(new vscode.Range(1, 0, 1, 0));
    // baz.txt
    expect(threads[10].range).toEqual(new vscode.Range(0, 0, 0, 0));
    expect(threads[11].range).toEqual(new vscode.Range(2, 0, 2, 0));
    expect(threads[12].range).toEqual(new vscode.Range(4, 0, 4, 0));
    expect(threads[13].range).toEqual(new vscode.Range(6, 0, 6, 0));
  });

  it('supports comment reply', async () => {
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
          'foo.txt': 'A\nB\nC',
        });
        await git.addAll();
        await git.commit(`ABC\n\nChange-Id: ${changeId}\n`, {
          all: true,
        });
      },
      'gerrit_supports_comment_reply'
    );

    const commitId = await git.getCommitId();

    FakeGerrit.initialize({accountsMe: AUTHOR}).setChange({
      id: changeId,
      info: changeInfo(changeId, [commitId]),
      comments: {
        'foo.txt': [
          unresolvedCommentInfo({
            line: 1,
            message: '1 - unresolved',
            commitId,
          }),
          resolvedCommentInfo({
            line: 2,
            message: '2 - resolved',
            commitId,
          }),
          unresolvedCommentInfo({
            line: 3,
            message: '3 - unresolved',
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

    const fooFilePath = abs('foo.txt');

    vscodeEmitters.workspace.onDidOpenTextDocument.fire({
      uri: vscode.Uri.file(fooFilePath),
      fileName: fooFilePath,
    } as vscode.TextDocument);

    await completeShowChangeEvents.read();

    const threads = threadsSortedByFirstCommentBody(state.commentController);

    expect(threads[0].comments.length).toEqual(1);
    expect(threads[1].comments.length).toEqual(1);
    expect(threads[2].comments.length).toEqual(1);

    expect(threads[0].contextValue).toMatch(/<unresolved>/);
    expect(threads[1].contextValue).toMatch(/<resolved>/);
    expect(threads[2].contextValue).toMatch(/<unresolved>/);

    // Reply to unresolved comment.
    await vscodeSpy.commands.executeCommand('chromiumide.gerrit.reply', {
      thread: threads[0],
      text: 'still unresolved',
    });
    await completeShowChangeEvents.read();

    // Unresolve comment.
    await vscodeSpy.commands.executeCommand(
      'chromiumide.gerrit.replyAndUnresolve',
      {
        thread: threads[1],
        text: 'unresolve',
      }
    );
    await completeShowChangeEvents.read();

    // Resolve comment.
    await vscodeSpy.commands.executeCommand(
      'chromiumide.gerrit.replyAndResolve',
      {
        thread: threads[2],
        text: 'resolve',
      }
    );
    await completeShowChangeEvents.read();

    // Draft comments are added to the view.
    expect(threads[0].comments.length).toEqual(2);
    expect(threads[1].comments.length).toEqual(2);
    expect(threads[2].comments.length).toEqual(2);

    expect(threads[0].contextValue).toMatch(/<unresolved>/);
    expect(threads[1].contextValue).toMatch(/<unresolved>/);
    expect(threads[2].contextValue).toMatch(/<resolved>/);

    // Draft comments can be discarded.
    await vscode.commands.executeCommand(
      'chromiumide.gerrit.discardDraft',
      threads[0].comments[1]
    );
    await completeShowChangeEvents.read();
    expect(threads[0].comments.length).toEqual(1);

    const packageJson = readPackageJson();
    const isCommandEnabled = (
      group: keyof typeof packageJson.contributes.menus,
      name: string,
      comment: vscode.Comment
    ) =>
      testing.evaluateWhenClause(
        packageJson.contributes.menus[group].find(e => e.command === name)!
          .when,
        {
          comment: comment.contextValue!,
        }
      );

    // Draft comments should be editable.
    expect(
      isCommandEnabled(
        'comments/comment/title',
        'chromiumide.gerrit.editDraft',
        threads[1].comments[1]
      )
    ).toBeTrue();

    // Start editing.
    await vscode.commands.executeCommand(
      'chromiumide.gerrit.editDraft',
      threads[1].comments[1]
    );
    await completeShowChangeEvents.read();

    expect(threads[1].comments[1].mode).toEqual(vscode.CommentMode.Editing);
    // The button to start editing is no longer shown.
    expect(
      isCommandEnabled(
        'comments/comment/title',
        'chromiumide.gerrit.editDraft',
        threads[1].comments[1]
      )
    ).toBeFalse();

    // The cancel button should be shown.
    expect(
      isCommandEnabled(
        'comments/comment/context',
        'chromiumide.gerrit.editDraftCancel',
        threads[1].comments[1]
      )
    ).toBeTrue();

    await vscode.commands.executeCommand(
      'chromiumide.gerrit.editDraftCancel',
      threads[1].comments[1]
    );
    await completeShowChangeEvents.read();

    expect(threads[1].comments[1].mode).toEqual(vscode.CommentMode.Preview);
    // The button to start editing is shown again.
    expect(
      isCommandEnabled(
        'comments/comment/title',
        'chromiumide.gerrit.editDraft',
        threads[1].comments[1]
      )
    ).toBeTrue();

    // Start editing again.
    await vscode.commands.executeCommand(
      'chromiumide.gerrit.editDraft',
      threads[1].comments[1]
    );
    await completeShowChangeEvents.read();

    // The UI allows the user to directly edit the comment body; emulate it.
    threads[1].comments[1].body = 'still unresolved';

    await vscode.commands.executeCommand(
      'chromiumide.gerrit.editDraftReply',
      threads[1].comments[1]
    );
    await completeShowChangeEvents.read();
    expect(threads[1].comments[1]).toEqual(
      jasmine.objectContaining({
        body: new vscode.MarkdownString('still unresolved'),
        contextValue: '<draft><unresolved>',
      })
    );

    // Test the reply and resolve command.
    await vscode.commands.executeCommand(
      'chromiumide.gerrit.editDraft',
      threads[1].comments[1]
    );
    await completeShowChangeEvents.read();

    threads[1].comments[1].body = 'now resolved';

    await vscode.commands.executeCommand(
      'chromiumide.gerrit.editDraftReplyAndResolve',
      threads[1].comments[1]
    );
    await completeShowChangeEvents.read();
    expect(threads[1].comments[1]).toEqual(
      jasmine.objectContaining({
        body: new vscode.MarkdownString('now resolved'),
        contextValue: '<draft><resolved>',
      })
    );

    // Test the reply and unresolve command.
    await vscode.commands.executeCommand(
      'chromiumide.gerrit.editDraft',
      threads[1].comments[1]
    );
    await completeShowChangeEvents.read();

    threads[1].comments[1].body = 'actually unresolved';

    await vscode.commands.executeCommand(
      'chromiumide.gerrit.editDraftReplyAndUnresolve',
      threads[1].comments[1]
    );
    await completeShowChangeEvents.read();
    expect(threads[1].comments[1]).toEqual(
      jasmine.objectContaining({
        body: new vscode.MarkdownString('actually unresolved'),
        contextValue: '<draft><unresolved>',
      })
    );
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
