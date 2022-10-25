// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as api from '../../../../features/gerrit/api';
import {TEST_ONLY} from '../../../../features/gerrit/gerrit';
import * as https from '../../../../features/gerrit/https';
import * as metrics from '../../../../features/metrics/metrics';
import * as testing from '../../../testing';

const {formatGerritTimestamp, Gerrit, partitionThreads} = TEST_ONLY;

describe('partitionThreads', () => {
  type CommentInfoLike = Pick<
    api.CommentInfo,
    'id' | 'updated' | 'in_reply_to'
  >;

  it('breaks threads', () => {
    const zeroTime = ' 00:00:00.000000000';
    const comments: CommentInfoLike[] = [
      {
        id: 'reply_1_1',
        in_reply_to: 'thread_1',
        updated: '2022-09-10' + zeroTime,
      },
      {
        id: 'reply_1_2',
        in_reply_to: 'reply_1_1',
        updated: '2022-09-20' + zeroTime,
      },
      {
        id: 'thread_1',
        updated: '2022-09-01' + zeroTime,
      },

      {id: 'thread_2', updated: '2022-09-05' + zeroTime},
      {id: 'thread_3', updated: '2022-09-07' + zeroTime},
      {
        id: 'reply_3_1',
        in_reply_to: 'thread_3',
        updated: '2022-09-08' + zeroTime,
      },
      {
        id: 'reply_to_nonexisting',
        in_reply_to: 'does_not_exist',
        updated: '2022-09-30' + zeroTime,
      },
    ];
    const input = {
      'file/path.cc': comments.map(c => c as api.CommentInfo),
    };

    const oc = jasmine.objectContaining;
    const want = {
      'file/path.cc': [
        oc({
          comments: [
            oc({id: 'thread_1'}),
            oc({id: 'reply_1_1'}),
            oc({id: 'reply_1_2'}),
          ],
        }),
        oc({comments: [oc({id: 'thread_2'})]}),
        oc({comments: [oc({id: 'thread_3'}), oc({id: 'reply_3_1'})]}),
        oc({comments: [oc({id: 'reply_to_nonexisting'})]}),
      ],
    };

    expect(partitionThreads(input)).toEqual(want);
  });
});

describe('formatGerritTimestaps', () => {
  it("formats today's date as hours and minutes", () => {
    const now = new Date();

    const year = now.getUTCFullYear().toString();
    const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = now.getUTCDate().toString().padStart(2, '0');
    const hours = now.getUTCHours().toString().padStart(2, '0');
    const minutes = now.getUTCMinutes().toString().padStart(2, '0');

    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:04.000000000`;
    // We don't know the local timezone, only match the regex.
    expect(formatGerritTimestamp(timestamp)).toMatch(/[0-9]{2}:[0-9]{2}/);
  });

  it('formats dates long time ago as year, month, and day', () => {
    // Test only the year, because month name could be localized
    // and the day may depend on the timezone
    expect(formatGerritTimestamp('2018-09-27 09:25:04.000000000')).toMatch(
      /^2018/
    );
  });

  it('does not crash on malformed input', () => {
    const badTimestamp = 'last Monday';
    expect(formatGerritTimestamp(badTimestamp)).toEqual(badTimestamp);
  });
});

// From crrev.com/c/3951631
// JSON was simplified by leaving out some avatars, leading )]}\n was preserved
const SIMPLE_COMMENT_GERRIT_JSON = (commitId1: string) => `)]}
{
  "cryptohome/cryptohome.cc": [
    {
      "author": {
        "_account_id": 1355869,
        "name": "Tomasz Tylenda",
        "email": "ttylenda@chromium.org",
        "avatars": [
          {
            "url": "https://lh3.googleusercontent.com/-9a8_POyNIEg/AAAAAAAAAAI/AAAAAAAAAAA/XD1eDsycuww/s32-p/photo.jpg",
            "height": 32
          }
        ]
      },
      "change_message_id": "592dcb09ed96952012e147fe621d264db460cd6f",
      "unresolved": true,
      "patch_set": 1,
      "id": "b2698729_8e2b9e9a",
      "line": 3,
      "updated": "2022-10-13 05:27:40.000000000",
      "message": "Unresolved comment on the added line.",
      "commit_id": "${commitId1}"
    }
  ]
}
`;

// Based on crrev.com/c/3954724, important bits are:
//   "Comment on termios" on line 15 (1-base) of the first patch set
//   "Comment on unistd" on line 18 (1-base) of the second patch set
const TWO_PATCHSETS_GERRIT_JSON = (commitId1: string, commitId2: string) => `)]}
{
  "cryptohome/cryptohome.cc": [
    {
      "author": {
        "_account_id": 1355869,
        "name": "Tomasz Tylenda",
        "email": "ttylenda@chromium.org",
        "avatars": [
          {
            "url": "https://lh3.googleusercontent.com/-9a8_POyNIEg/AAAAAAAAAAI/AAAAAAAAAAA/XD1eDsycuww/s32-p/photo.jpg",
            "height": 32
          }
        ]
      },
      "change_message_id": "d2e2365a4832e8d38a99d4d6d24fc4937dddb6de",
      "unresolved": true,
      "patch_set": 1,
      "id": "3d3c9023_4550daf0",
      "line": 15,
      "updated": "2022-10-14 05:46:56.000000000",
      "message": "Comment on termios",
      "commit_id": "${commitId1}"
    },
    {
      "author": {
        "_account_id": 1355869,
        "name": "Tomasz Tylenda",
        "email": "ttylenda@chromium.org",
        "avatars": [
          {
            "url": "https://lh3.googleusercontent.com/-9a8_POyNIEg/AAAAAAAAAAI/AAAAAAAAAAA/XD1eDsycuww/s32-p/photo.jpg",
            "height": 32
          }
        ]
      },
      "change_message_id": "4e12822a1acbaefaf43a4e63504cf55fd044b3fa",
      "unresolved": true,
      "patch_set": 2,
      "id": "9845ccec_3e772fd4",
      "line": 18,
      "updated": "2022-10-14 05:49:02.000000000",
      "message": "Comment on unistd",
      "commit_id": "${commitId2}"
    }
  ]
}
`;

describe('Gerrit', () => {
  const tempDir = testing.tempDir();

  it('displays a comment', async () => {
    const root = tempDir.path;
    const abs = (relative: string) => path.join(root, relative);

    // Create a repo with two commits:
    //   1) The first simulates cros/main.
    //   2) The second is the commit on which Gerrit review is taking place.
    const git = new testing.Git(root);
    await git.init();
    await git.commit('First');
    await git.checkout('cros/main', {createBranch: true});
    await git.checkout('main');
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc': 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n',
    });
    await git.addAll();
    const commitId = await git.commit(
      'Second\nChange-Id: I23f50ecfe44ee28972aa640e1fa82ceabcc706a8'
    );

    // We verify that the comments were shown by verifying interactions
    // with commentController.
    const commentController = jasmine.createSpyObj<vscode.CommentController>(
      'commentController',
      ['createCommentThread']
    );

    // Without it we get an error setting fields on an undefined object,
    // which causes flakiness.
    commentController.createCommentThread.and.returnValue(
      {} as vscode.CommentThread
    );

    const statusBar = vscode.window.createStatusBarItem();
    let statusBarShown = false;
    statusBar.show = () => {
      statusBarShown = true;
    };

    const gerrit = new Gerrit(
      commentController,
      vscode.window.createOutputChannel('gerrit'),
      statusBar
    );

    const fileName = abs('cryptohome/cryptohome.cc');

    spyOn(https, 'get')
      .withArgs(
        'https://chromium-review.googlesource.com/changes/I23f50ecfe44ee28972aa640e1fa82ceabcc706a8/comments'
      )
      .and.returnValue(Promise.resolve(SIMPLE_COMMENT_GERRIT_JSON(commitId)));

    spyOn(metrics, 'send');

    await expectAsync(gerrit.showComments(fileName)).toBeResolved();

    expect(commentController.createCommentThread).toHaveBeenCalledTimes(1);
    const callData = commentController.createCommentThread.calls.first();
    expect(callData.args[0].fsPath).toEqual(abs('cryptohome/cryptohome.cc'));
    expect(callData.args[1].start.line).toEqual(2);
    expect(callData.args[2][0].body).toEqual(
      'Unresolved comment on the added line.'
    );

    expect(statusBarShown).toBeTrue();
    expect(statusBar.text).toEqual('$(comment) 1');
    expect(metrics.send).toHaveBeenCalledOnceWith({
      category: 'background',
      group: 'gerrit',
      action: 'update comments',
      value: 1,
    });
  });

  // Tests, that when a Gerrit change contains multiple patchsets,
  // comments from distinct patchsets are repositioned correctly.
  //
  // To test a single aspect of the algorithm (handling multiple patchsets),
  // the comments do not overlap with changes. This way changes to
  // the repositioning algorithm will not affect this test.
  it('repositions comments from two patch sets', async () => {
    const root = tempDir.path;
    const abs = (relative: string) => path.join(root, relative);

    // Create a file that we'll be changing.
    const git = new testing.Git(root);
    await git.init();
    await testing.putFiles(git.root, {
      'cryptohome/cryptohome.cc':
        'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\n' +
        'Line 7\n' +
        'Line 8\nLine 9\nLine 10\nLine 11\nLine 12\nLine 13\nLine 14\nLine 15\n',
    });
    await git.addAll();
    await git.commit('Initial file');
    await git.checkout('cros/main', {createBranch: true});
    await git.checkout('main');

    // First review patchset.
    const changeId = 'I6adb56bd6f1998dde6b24af26881095292ac2620';
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

    const commentController = jasmine.createSpyObj<vscode.CommentController>(
      'commentController',
      ['createCommentThread']
    );

    // Without it we get an error setting fields on an undefined object.
    commentController.createCommentThread.and.returnValue(
      {} as vscode.CommentThread
    );

    const gerrit = new Gerrit(
      commentController,
      vscode.window.createOutputChannel('gerrit'),
      vscode.window.createStatusBarItem()
    );

    const fileName = abs('cryptohome/cryptohome.cc');

    spyOn(https, 'get')
      .withArgs(
        `https://chromium-review.googlesource.com/changes/${changeId}/comments`
      )
      .and.returnValue(
        Promise.resolve(TWO_PATCHSETS_GERRIT_JSON(commitId1, commitId2))
      );

    await expectAsync(gerrit.showComments(fileName)).toBeResolved();

    expect(commentController.createCommentThread).toHaveBeenCalledTimes(2);
    // Order of calls is irrelevant, but since our algorithm is deterministic,
    // we can rely on it for simplicity.
    const callData = commentController.createCommentThread.calls.all();

    expect(callData[0].args[0].fsPath).toEqual(abs('cryptohome/cryptohome.cc'));
    // The original comment is on line 15. It is shifted by 2 lines (+2)
    // and represented in zero-based (-1).
    expect(callData[0].args[1].start.line).toEqual(16);
    expect(callData[0].args[2][0].body).toEqual('Comment on termios');

    expect(callData[1].args[0].fsPath).toEqual(abs('cryptohome/cryptohome.cc'));
    // The comment on the second patchset stays on line 18,
    // but we convert 1-based number to 0-based.
    expect(callData[1].args[1].start.line).toEqual(17);
    expect(callData[1].args[2][0].body).toEqual('Comment on unistd');
  });
});
