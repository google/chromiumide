// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as api from '../api';
import * as git from '../git';
import {CommentThread} from './comment_thread';

/**
 * Revision (patchset) of Gerrit
 */
export class Revision {
  readonly commentThreadsMap: FilePathToCommentThreads;
  constructor(
    localCommitId: string,
    repoId: git.RepoId,
    changeId: string,
    changeNumber: number,
    readonly commitId: string,
    private readonly revisionInfo: api.RevisionInfo,
    private readonly commentInfosMap: api.FilePathToCommentInfos
  ) {
    const commentThreadsMap: {
      [filePath: string]: readonly CommentThread[];
    } = {};
    for (const [filePath, apiCommentInfos] of Object.entries(commentInfosMap)) {
      // Copy the input to avoid modifying data received from Gerrit API.
      const commentInfos = [...apiCommentInfos];
      // Sort the input to make sure we see ids before they are used in in_reply_to.
      commentInfos.sort((c1, c2) => c1.updated.localeCompare(c2.updated));
      // Get a map from the head comment id to the CommentInfo array array
      const splitCommentInfos: api.CommentInfo[][] = [];
      const idxMap = new Map<string, number>();
      for (const commentInfo of commentInfos) {
        const inReplyTo = commentInfo.in_reply_to;
        // idx is undefined for the first comment in a thread,
        // and for a reply to a comment we haven't seen.
        // The second case should not happen.
        let idx = inReplyTo ? idxMap.get(inReplyTo) : undefined;
        if (idx === undefined) {
          idx = splitCommentInfos.length;
          splitCommentInfos.push([commentInfo]);
        } else {
          splitCommentInfos[idx].push(commentInfo);
        }
        idxMap.set(commentInfo.id, idx);
      }
      // Construct the CommentThread array
      const commentThreads = [];
      for (const commentInfos of splitCommentInfos) {
        commentThreads.push(
          new CommentThread(
            localCommitId,
            repoId,
            changeId,
            changeNumber,
            this.revisionNumber,
            commentInfos,
            filePath
          )
        );
      }
      commentThreadsMap[filePath] = commentThreads;
    }
    this.commentThreadsMap = commentThreadsMap;
  }

  private get revisionNumber(): number | 'edit' {
    return this.revisionInfo._number;
  }

  /**
   * Returns whether this and other represents the identical revision state,
   * i.e. whether they would produce the same view.
   */
  equals(other: Revision): boolean {
    if (this.revisionNumber !== other.revisionNumber) return false;
    if (
      Object.keys(this.commentInfosMap).length !==
      Object.keys(other.commentInfosMap).length
    ) {
      return false;
    }
    for (const [filePath, commentInfos] of Object.entries(
      this.commentInfosMap
    )) {
      const cs = other.commentInfosMap[filePath];
      if (!cs) return false;

      if (commentInfos.length !== cs.length) return false;

      for (let i = 0; i < commentInfos.length; i++) {
        if (commentInfos[i].id !== cs[i].id) return false;
        if (commentInfos[i].isPublic !== cs[i].isPublic) return false;
        if (commentInfos[i].updated !== cs[i].updated) return false;
      }
    }
    return true;
  }
}

/**
 * Like FilePathToCommentInfos, but the comments are partitioned
 * into comment threads represented as arrays of comments.
 */
export type FilePathToCommentThreads = Readonly<{
  [filePath: string]: readonly CommentThread[];
}>;
