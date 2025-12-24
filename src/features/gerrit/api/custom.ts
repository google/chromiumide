// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as api from './gerrit';

// Our custom APIs for Gerrit

/** FilePathToBaseCommentInfos extended with extra fields */
export type FilePathToCommentInfos = {
  readonly [filePath: string]: readonly CommentInfo[];
};

/** BaseCommentInfo extended with extra fields */
export interface CommentInfo extends api.BaseCommentInfo {
  /** Whether the comment is public or draft */
  readonly isPublic: boolean;
  /** Ensures that the author field is not undefined */
  readonly author: api.AccountInfo;
}

/**
 * Turn api.AccountInfo into the name string
 */
export function accountName(a: api.AccountInfo): string {
  if (a.display_name) return a.display_name;
  if (a.name) return a.name;
  return 'id' + a._account_id;
}

/**
 * Merge FilePathToCommentInfos
 */
export function mergeCommentInfos(
  commentInfosMap1: FilePathToCommentInfos,
  commentInfosMap2?: FilePathToCommentInfos
): FilePathToCommentInfos {
  const res: {[filePath: string]: CommentInfo[]} = {};
  for (const [filePath, commentInfos1] of Object.entries(commentInfosMap1)) {
    if (res[filePath] === undefined) res[filePath] = [];
    res[filePath].push(...commentInfos1);
  }
  if (commentInfosMap2) {
    for (const [filePath, commentInfos2] of Object.entries(commentInfosMap2)) {
      if (res[filePath] === undefined) res[filePath] = [];
      res[filePath].push(...commentInfos2);
    }
  }
  return res;
}
