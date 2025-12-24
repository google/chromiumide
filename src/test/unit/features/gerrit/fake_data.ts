// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as api from '../../../../features/gerrit/api';
import {RevisionInfo} from '../../../../features/gerrit/api';

type PartialCommentInfo = {
  id?: string;
  line?: number;
  range?: api.CommentRange;
  message?: string;
  commitId?: string;
  inReplyTo?: string;
  updated?: string;
};

export function unresolvedCommentInfo(
  info: PartialCommentInfo
): api.BaseCommentInfo {
  return commentInfo(info, true);
}

export function resolvedCommentInfo(
  info: PartialCommentInfo
): api.BaseCommentInfo {
  return commentInfo(info, false);
}

export function changeInfo(
  changeId: string,
  commitIds: string[]
): api.ChangeInfo {
  const revisions: {[commitId: string]: RevisionInfo} = {};
  commitIds.forEach((commitId, i) => {
    revisions[commitId] = {
      _number: i,
      uploader: AUTHOR,
      created: '1970-01-01 00:00:00.000000000',
    };
  });
  return {change_id: changeId, revisions} as api.ChangeInfo;
}

let globalCommentId = 0;

function commentInfo(
  info: PartialCommentInfo,
  unresolved: boolean
): api.BaseCommentInfo {
  const {line, range, message, commitId, inReplyTo, updated, id} = info;
  return {
    author: AUTHOR,
    id: id ?? `${globalCommentId++}`,
    line,
    range,
    message: message ?? 'a',
    commit_id: commitId ?? '1',
    unresolved,
    in_reply_to: inReplyTo,
    updated: updated ?? '1970-01-01 00:00:00.000000000',
  };
}

// Default author of the comments.
export const AUTHOR: api.AccountInfo = Object.freeze({
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
