// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as commonUtil from '../../../../common/common_util';
import * as api from '../../../../features/gerrit/api';
import * as gerrit from '../../../../features/gerrit/gerrit';
import * as git from '../../../../features/gerrit/git';
import * as testing from '../../../testing';

const {parseDiffHunks} = git.TEST_ONLY;
const {shiftCommentThreadsByHunks} = gerrit.TEST_ONLY;

function range(
  start_line: number,
  start_character: number,
  end_line: number,
  end_character: number
): api.CommentRange {
  return {
    start_line,
    start_character,
    end_line,
    end_character,
  };
}

type CommentInfoLike = {
  author?: api.AccountInfo;
  line?: number;
  range?: api.CommentRange;
  message?: string;
};

function commentThread(
  data: CommentInfoLike,
  opts?: {newLine?: number}
): gerrit.CommentThread {
  const revision = undefined as unknown as gerrit.Revision;
  data.author = {_account_id: 12345};
  const commentInfo = data as api.CommentInfo;
  const t = new gerrit.CommentThread(revision, [commentInfo]);
  if (opts?.newLine) {
    t.overwriteShiftForTesting(opts.newLine - data.line!);
  }
  return t;
}

describe('Comment shifting algorithm (hardcoded diff hunks)', () => {
  const hunksMap: git.FilePathToHunks = {
    'foo.ts': [
      // First line added.
      new git.Hunk(0, 0, 1, 1),
      // Third line removed.
      new git.Hunk(3, 1, 3, 0),
      // Fifth line modified, sixth to seventh line removed.
      new git.Hunk(5, 3, 5, 1),
    ],
    'bar.ts': [
      // First line added.
      new git.Hunk(0, 0, 1, 1),
    ],
  };

  it('updates comment threads', () => {
    const commentThreadsMap: gerrit.FilePathToCommentThreads = {
      'foo.ts': [
        commentThread({message: 'foo'}), // comment on a file
        commentThread({range: range(1, 1, 1, 2), line: 1}), // comment on characters
        commentThread({line: 1}), // comment on a line
        commentThread({line: 3}), // comment on a removed line
        commentThread({line: 4}),
        commentThread({line: 5}), // comment in a removed hunk
        commentThread({line: 7}),
        commentThread({line: 8}),
        commentThread({range: range(3, 1, 6, 2), line: 3}), // comment across multiple hunks
      ],
      'bar.ts': [commentThread({line: 1})],
      // TODO(teramon): Add other test cases
    };

    const wantCommentThreadsMap = {
      'foo.ts': [
        commentThread({message: 'foo'}), // comment on a file
        commentThread({range: range(1, 1, 1, 2), line: 1}, {newLine: 2}), // comment on characters
        commentThread({line: 1}, {newLine: 2}), // comment on a line
        commentThread({line: 3}), // comment on a removed line
        commentThread({line: 4}),
        commentThread({line: 5}), // comment in a removed hunk
        commentThread({line: 7}, {newLine: 5}),
        commentThread({line: 8}, {newLine: 6}),
        commentThread({range: range(3, 1, 6, 2), line: 3}), // comment across multiple hunks.
      ],
      'bar.ts': [commentThread({line: 1}, {newLine: 2})],
      // TODO(teramon): Add other test cases
    } as unknown as gerrit.FilePathToCommentThreads;

    shiftCommentThreadsByHunks(commentThreadsMap, hunksMap);
    expect(commentThreadsMap).toEqual(wantCommentThreadsMap);
  });
});

describe('Comment shifting algorithm (generated diff hunks)', () => {
  const tempDir = testing.tempDir();

  // Returned hunks will be on a file named 'right.txt'.
  // (In the production code we diff two versions of the same file,
  // so there is no similar issue).
  async function readDiffHunks(
    left: string,
    right: string
  ): Promise<git.FilePathToHunks> {
    await testing.putFiles(tempDir.path, {
      'left.txt': left,
      'right.txt': right,
    });
    const diff = (
      await commonUtil.execOrThrow(
        'git',
        ['diff', '-U0', '--no-index', 'left.txt', 'right.txt'],
        {cwd: tempDir.path, ignoreNonZeroExit: true}
      )
    ).stdout;
    return parseDiffHunks(diff);
  }

  it('handles changes that add lines between comments', async () => {
    const left = ` 1
      2
      3
      4
      `;
    const right = ` 1
      ADD
      2
      ADD
      3
      ADD
      4
      `;

    const diffHunksMap: git.FilePathToHunks = await readDiffHunks(left, right);
    const commentThreadsMap: gerrit.FilePathToCommentThreads = {
      'right.txt': [
        commentThread({line: 1, message: 'one'}),
        commentThread({line: 2, message: 'two'}),
        commentThread({line: 3, message: 'three'}),
        commentThread({line: 4, message: 'four'}),
      ],
    };

    shiftCommentThreadsByHunks(commentThreadsMap, diffHunksMap);

    expect(commentThreadsMap['right.txt']).toEqual([
      commentThread({line: 1, message: 'one'}, {newLine: 1}),
      commentThread({line: 2, message: 'two'}, {newLine: 3}),
      commentThread({line: 3, message: 'three'}, {newLine: 5}),
      commentThread({line: 4, message: 'four'}, {newLine: 7}),
    ]);
  });
});
