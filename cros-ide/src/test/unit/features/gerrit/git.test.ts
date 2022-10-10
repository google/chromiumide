// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {TEST_ONLY} from '../../../../features/gerrit/git';

const {parseChangeIds} = TEST_ONLY;

const gitLog = `commit 8c3682b20db653d55e4bb1e56294d4c16b95a5f5 (gerrit-threads)
Author: Tomasz Tylenda <ttylenda@chromium.org>
Date:   Fri Oct 7 17:19:29 2022 +0900

    cros-ide: reposition with --merge-base

    WIP

    BUG=b:216048068
    TEST=tbd

    Change-Id: I6f1ec79d7b221bb7c7343cc953db1b6f6369fbb4

commit c3b2ca4da09c2452eefad3f3bf98f0f675ba8ad3
Author: Tomasz Tylenda <ttylenda@chromium.org>
Date:   Fri Oct 7 11:46:51 2022 +0900

    cros-ide: support Gerrit threads

    - When comments are retrieved we partition them into threads.
    - The function to show comments is modified to take an array of comments
      corresponding to a thread.
    - Repositioning is done only on the first comment in a thread, because
      it determines placement of the thread.

    BUG=b:216048068
    TEST=https://screenshot.googleplex.com/7krgA2sbxn6v4Uc.png

    Change-Id: Ic7594ee4825feb488c12aac31bb879c03932fb45
`;

const gitLogWithSpuriousChangeId = `commit c3b2ca4da09c2452eefad3f3bf98f0f675ba8ad3
Author: Tomasz Tylenda <ttylenda@chromium.org>
Date:   Fri Oct 7 11:46:51 2022 +0900

    cros-ide: support Gerrit threads

     We can include Change-Id: Iabcd inside the message.

    Change-Id: Ic7594ee4825feb488c12aac31bb879c03932fb45
`;

describe('parseChangeIds', () => {
  it('extracts commit ids from git log', () => {
    expect(parseChangeIds(gitLog)).toEqual([
      'I6f1ec79d7b221bb7c7343cc953db1b6f6369fbb4',
      'Ic7594ee4825feb488c12aac31bb879c03932fb45',
    ]);
  });

  it('handles empty input', () => {
    expect(parseChangeIds('')).toEqual([]);
  });

  it('ignores change id inside a commit message', () => {
    expect(parseChangeIds(gitLogWithSpuriousChangeId)).toEqual([
      'Ic7594ee4825feb488c12aac31bb879c03932fb45',
    ]);
  });
});
