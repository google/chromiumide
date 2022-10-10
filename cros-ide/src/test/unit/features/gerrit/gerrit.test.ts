// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as api from '../../../../features/gerrit/api';
import {TEST_ONLY} from '../../../../features/gerrit/gerrit';

const {partitionThreads} = TEST_ONLY;

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
        [oc({id: 'thread_1'}), oc({id: 'reply_1_1'}), oc({id: 'reply_1_2'})],
        [oc({id: 'thread_2'})],
        [oc({id: 'thread_3'}), oc({id: 'reply_3_1'})],
        [oc({id: 'reply_to_nonexisting'})],
      ],
    };

    expect(partitionThreads(input)).toEqual(want);
  });
});
