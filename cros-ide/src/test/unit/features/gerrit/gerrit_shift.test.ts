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

function hunk(
  originalStartLine: number,
  originalLineSize: number,
  currentStartLine: number,
  currentLineSize: number
): git.Hunk {
  return {
    originalStartLine,
    originalLineSize,
    currentStartLine,
    currentLineSize,
  };
}

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
  line?: number;
  range?: api.CommentRange;
  message?: string;
};

function thread(
  data: CommentInfoLike,
  opts?: {shifted: number}
): gerrit.Thread {
  const t = new gerrit.Thread([data as api.CommentInfo]);
  t.initializeLocation();
  if (opts?.shifted) {
    t.line = opts.shifted;
  }
  return t;
}

describe('Comment shifting algorithm (hardcoded diff hunks)', () => {
  const testHunks: git.Hunks = {
    'foo.ts': [
      // First line added.
      hunk(0, 0, 1, 1),
      // Third line removed.
      hunk(3, 1, 3, 0),
      // Fifth line modified, sixth to seventh line removed.
      hunk(5, 3, 5, 1),
    ],
    'bar.ts': [
      // First line added.
      hunk(0, 0, 1, 1),
    ],
  };

  it('updates change comments', () => {
    const changeComments: gerrit.ChangeThreads = {
      'foo.ts': [
        thread({message: 'foo'}), // comment on a file
        thread({range: range(1, 1, 1, 2), line: 1}), // comment on characters
        thread({line: 1}), // comment on a line
        thread({line: 3}), // comment on a removed line
        thread({line: 4}),
        thread({line: 5}), // comment in a removed hunk
        thread({line: 7}),
        thread({line: 8}),
        // {range: range(3, 1, 6, 2), line: 1}, // comment across multiple hunks.
      ],
      'bar.ts': [thread({line: 1})],
      // TODO(teramon): Add other test cases
    };

    const oc = jasmine.objectContaining;
    const wantComments = {
      'foo.ts': [
        oc({comments: [oc({message: 'foo'})]}), // comment on a file
        oc({range: range(2, 1, 2, 2), line: 2}), // comment on characters
        oc({line: 2}), // comment on a line
        oc({line: 3}), // comment on a removed line
        oc({line: 4}),
        oc({line: 5}), // comment in a removed hunk
        oc({line: 5}),
        oc({line: 6}),
        // {range: range(3, 1, 5, 2), line: 1}, // comment across multiple hunks.
      ],
      'bar.ts': [oc({line: 2})],
      // TODO(teramon): Add other test cases
    } as unknown as gerrit.ChangeThreads;

    gerrit.updateChangeComments(testHunks, changeComments);
    expect(changeComments).toEqual(wantComments);
  });
});

describe('Comment shifting algorithm (generated diff hunks)', () => {
  const tempDir = testing.tempDir();

  // Returned hunks will be on a file named 'left.txt'.
  // (In the production code we diff two versions of the same file,
  // so there is no similar issue).
  async function getDiffHunks(left: string, right: string): Promise<git.Hunks> {
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

    const diffHunks: git.Hunks = await getDiffHunks(left, right);
    const changeThreads: gerrit.ChangeThreads = {
      'left.txt': [
        thread({line: 1, message: 'one'}),
        thread({line: 2, message: 'two'}),
        thread({line: 3, message: 'three'}),
        thread({line: 4, message: 'four'}),
      ],
    };

    gerrit.updateChangeComments(diffHunks, changeThreads);

    expect(changeThreads['left.txt']).toEqual([
      // should be 1
      thread({line: 1, message: 'one'}, {shifted: 4}),
      // should be 3
      thread({line: 2, message: 'two'}, {shifted: 5}),
      // should be 5
      thread({line: 3, message: 'three'}, {shifted: 6}),
      thread({line: 4, message: 'four'}, {shifted: 7}),
    ]);
  });
});
