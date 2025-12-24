// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as api from '../api';
import * as git from '../git';
import * as helpers from '../helpers';
import {
  CommentContextValue,
  CommentEditState,
  CommentPublicity,
  CommentResolveState,
} from './context_value';

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

  isEqual(other: Comment): boolean {
    return (
      this.commentId === other.commentId &&
      this.commentInfo.updated === other.commentInfo.updated
    );
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
export function toVscodeComment(
  comment: Comment,
  editing: boolean
): VscodeComment {
  const c = comment.commentInfo;
  return {
    author: {name: api.accountName(c.author)},
    label:
      (c.isPublic ? '' : 'Draft / ') + helpers.formatGerritTimestamp(c.updated),
    body: new vscode.MarkdownString(c.message),
    mode: editing ? vscode.CommentMode.Editing : vscode.CommentMode.Preview,
    contextValue: getCommentContextValue(c, editing),
    gerritComment: comment,
  };
}

/**
 * Determines the contextValue that can be assigned to a comment, or comment
 * thread in order to drive ui related functionality. These are referenced
 * within `when` clauses of the package.json file.
 */
export function getCommentContextValue(
  c: api.CommentInfo | null | undefined,
  editing: boolean
): CommentContextValue {
  const publicity = c?.isPublic
    ? CommentPublicity.Public
    : CommentPublicity.Draft;

  const resolveState = c?.unresolved
    ? CommentResolveState.Unresolved
    : CommentResolveState.Resolved;

  const editState = editing
    ? CommentEditState.Editing
    : CommentEditState.NoEditing;

  return `${publicity}${resolveState}${editState}`;
}
