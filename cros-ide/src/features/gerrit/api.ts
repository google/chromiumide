// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Response from Gerrit List Change Comments API.
 *
 * https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html#list-change-comments
 */
export type ChangeComments = {
  [filePath: string]: CommentInfo[];
};

/**
 * https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html#comment-info
 */
export type CommentInfo = {
  id: string;
  // TODO(b:216048068): author is optional in the API
  author: AccountInfo;
  range?: CommentRange;
  // Comments on entire lines have `line` but not `range`.
  line?: number;
  in_reply_to?: string;
  updated: string;
  // TODO(b:216048068): message is optional in the API
  message: string;
  // SHA of the Git commit that the comment applies to.
  commit_id?: string;
};

/**
 * https://gerrit-review.googlesource.com/Documentation/rest-api-accounts.html#account-info
 */
export type AccountInfo = {
  // TODO(b:216048068): name is optional in the API
  name: string;
};

/**
 * https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html#comment-range
 */
export type CommentRange = {
  start_line: number; // 1-based
  start_character: number; // 0-based
  end_line: number; // 1-based
  end_character: number; // 0-based
};
