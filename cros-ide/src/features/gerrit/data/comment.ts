// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as api from '../api';
import * as git from '../git';
import * as helpers from '../helpers';

/** Gerrit comment */
export class Comment {
  constructor(
    readonly repoId: git.RepoId,
    readonly changeNumber: number,
    readonly commentInfo: api.CommentInfo
  ) {}

  get authorId(): number {
    return this.commentInfo.author._account_id;
  }
  get commentId(): string {
    return this.commentInfo.id;
  }
}

/** vscode.Comment extended with a reference to Comment */
export interface VscodeComment extends vscode.Comment {
  /**
   * Reference to the comment, which we can use in
   * event callbacks on the VS Code comment
   */
  readonly gerritComment: Comment;
}

/**
 * Turns Comment into VscodeComment.
 */
export function toVscodeComment(comment: Comment): VscodeComment {
  const c = comment.commentInfo;
  return {
    author: {name: api.accountName(c.author)},
    label:
      (c.isPublic ? '' : 'Draft / ') + helpers.formatGerritTimestamp(c.updated),
    body: new vscode.MarkdownString(c.message),
    mode: vscode.CommentMode.Preview,
    contextValue: getCommentContextValue(c),
    gerritComment: comment,
  };
}

/**
 * Determines the contextValue that can be assigned to a comment, or comment
 * thread in order to drive ui related functionality. These are referenced
 * within `when` clauses of the package.json file.
 */
export function getCommentContextValue(
  c: api.CommentInfo | null | undefined
): string {
  // Used to indicate a comment is public and can be linked to.
  const publicComment = '<public>';

  // Used to indicate a comment is a draft, and can't be linked to.
  const draftComment = '<draft>';

  if (c === null || c === undefined) {
    return draftComment;
  }

  return c.isPublic ? publicComment : draftComment;
}
