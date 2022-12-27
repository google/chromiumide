// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as api from '../../../../features/gerrit/api';
import {mergeCommentInfos} from '../../../../features/gerrit/api';

describe('accountName', () => {
  it('can use display_name', () => {
    expect(
      api.accountName({
        _account_id: 12345,
        display_name: 'John',
        name: 'John Smith',
      })
    ).toBe('John');
  });
  it('can use name', () => {
    expect(
      api.accountName({
        _account_id: 12345,
        name: 'John Smith',
      })
    ).toBe('John Smith');
  });
  it('can use _account_id: 12345', () => {
    expect(
      api.accountName({
        _account_id: 12345,
      })
    ).toBe('id12345');
  });
});

function fakeCommentInfo(message: string): api.CommentInfo {
  return {message} as api.CommentInfo;
}

describe('mergeCommitInfos', () => {
  const commentInfosMap = {
    'a.cc': [fakeCommentInfo('Wow')],
    'b.cc': [fakeCommentInfo('Yeah')],
  };
  it('can work with only one argument', () => {
    expect(mergeCommentInfos(commentInfosMap)).toEqual(commentInfosMap);
  });
  it('can merge two comment infos maps', () => {
    expect(
      mergeCommentInfos(commentInfosMap, {
        'b.cc': [fakeCommentInfo('Foo')],
        'c.cc': [fakeCommentInfo('Bar')],
      })
    ).toEqual({
      'a.cc': [fakeCommentInfo('Wow')],
      'b.cc': [fakeCommentInfo('Yeah'), fakeCommentInfo('Foo')],
      'c.cc': [fakeCommentInfo('Bar')],
    });
  });
});
