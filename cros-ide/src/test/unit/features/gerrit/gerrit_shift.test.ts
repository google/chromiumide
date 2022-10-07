// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as gerrit from '../../../../features/gerrit/gerrit';
import * as git from '../../../../features/gerrit/git';

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
): gerrit.CommentRange {
  return {
    start_line,
    start_character,
    end_line,
    end_character,
  };
}

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

describe('Gerrit support', () => {
  it('updates change comments', () => {
    // changeComments are modified in place
    const changeComments = {
      'foo.ts': [
        [{message: 'foo'}], // comment on a file
        [{range: range(1, 1, 1, 2), line: 1}], // comment on characters
        [{line: 1}], // comment on a line
        [{line: 3}], // comment on a removed line
        [{line: 4}],
        [{line: 5}], // comment in a removed hunk
        [{line: 7}],
        [{line: 8}],
        // {range: range(3, 1, 6, 2), line: 1}, // comment across multiple hunks.
      ],
      'bar.ts': [[{line: 1}]],
      // TODO(teramon): Add other test cases
    } as unknown as gerrit.ChangeThreads;

    const wantComments = {
      'foo.ts': [
        [{message: 'foo'}], // comment on a file
        [{range: range(2, 1, 2, 2), line: 2}], // comment on characters
        [{line: 2}], // comment on a line
        [{line: 3}], // comment on a removed line
        [{line: 4}],
        [{line: 5}], // comment in a removed hunk
        [{line: 5}],
        [{line: 6}],
        // {range: range(3, 1, 5, 2), line: 1}, // comment across multiple hunks.
      ],
      'bar.ts': [[{line: 2}]],
      // TODO(teramon): Add other test cases
    } as unknown as gerrit.ChangeThreads;

    gerrit.updateChangeComments(testHunks, changeComments);
    expect(changeComments).toEqual(wantComments);
  });
});
