// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as gitDocument from '../../../services/git_document';
import * as api from '../api';
import * as git from '../git';
import * as virtualDocument from '../virtual_document';
import {
  getCommentContextValue,
  toVscodeComment,
  Comment,
  VscodeComment,
} from './comment';

/**
 * Represents a Gerrit comment thread that belongs to a Gerrit CL.
 * The usage of this class is as follows.
 * 1. Initialize with the comment infos and the local git log info for the CL.
 * 2. Call getShift to compute the shift count.
 * 3. Call createVscodeCommentThread or decorateVscodeCommentThread with the shift count.
 */
export class CommentThread {
  private readonly comments: readonly Comment[];

  constructor(
    private readonly localCommitId: string,
    readonly repoId: git.RepoId,
    readonly changeId: string,
    readonly changeNumber: number,
    readonly revisionNumber: number | 'edit',
    commentInfos: api.CommentInfo[],
    readonly filePath: string
  ) {
    this.comments = commentInfos.map(
      commentInfo => new Comment(repoId, changeNumber, commentInfo)
    );
  }

  /**
   * Thread identifier which is the same for the same thread even if the class
   * instances are different or replies are added.
   */
  get id(): string {
    return this.firstComment.commentId;
  }

  get firstComment(): Comment {
    return this.comments[0];
  }
  get lastComment(): Comment {
    return this.comments[this.comments.length - 1];
  }

  /** Original line */
  private get originalLine(): number | undefined {
    return this.firstComment.commentInfo.line;
  }

  /** Shifted line */
  private line(shift: number): number | undefined {
    const ol = this.originalLine;
    if (ol === undefined) return undefined;
    return ol + shift;
  }

  /** Shifted range */
  private range(shift: number): api.CommentRange | undefined {
    const r = this.firstComment.commentInfo.range;
    if (r === undefined) return undefined;
    return {
      start_line: r.start_line + shift,
      start_character: r.start_character,
      end_line: r.end_line + shift,
      end_character: r.end_character,
    };
  }

  /** A thread is unresolved if its last comment is unresolved. */
  get unresolved(): boolean {
    // Unresolved can be undefined according to the API documentation,
    // but Gerrit always sent it on the changes the we inspected.
    return this.lastComment.commentInfo.unresolved!;
  }

  private get canReply(): boolean {
    return this.lastComment.commentInfo.isPublic;
  }

  /**
   * Computes how many line shift is needed to reposition the comment thread
   * from the given diff hunks.
   *
   * Thread position is determined by its first comment.
   */
  getShift(hunks: readonly git.Hunk[], filePath: string): number {
    let shift = 0;
    const ol = this.originalLine;
    for (const hunk of hunks) {
      if (this.followsHunk(hunk)) {
        // Comment outside the hunk
        shift += hunk.sizeDelta;
      } else if (this.withinRange(hunk.originalStart, hunk.originalEnd)) {
        // Comment within the hunk
        // Ensure the comment within the hunk still resides in the
        // hunk. If the hunk removes all the lines, the comment will
        // be moved to the line preceding the hunk.
        if (hunk.sizeDelta < 0 && ol !== undefined) {
          const protrusion = ol - (hunk.originalStart + hunk.currentSize) + 1;
          if (protrusion > 0) shift -= protrusion;
        }
      }
    }
    // Make sure we do not shift comments before the first line
    // because it causes errors (lines beyond the end of file are fine though).
    //
    // Note, that line numbers are 1-based. The code that shifts comments within
    // deleted hunks may put comments on line 0 (we use `<=` in case of unknown bugs),
    // so we adjust `shift` so that `originalLine + shift == 1`.
    if (ol !== undefined && ol + shift <= 0) shift = -(ol - 1);
    if (filePath === '/COMMIT_MSG' && ol !== undefined) {
      // Compensate the difference between commit message on Gerrit and Terminal
      shift -= ol > 6 ? 6 : ol - 1;
    }
    return shift;
  }

  /**
   * True if a thread starts after the hunk ends. Such threads should be moved
   * by the size change introduced by the hunk.
   */
  private followsHunk(hunk: git.Hunk): boolean {
    const ol = this.originalLine;
    if (!ol) return false;
    // Case 1: hunks that insert lines.
    // The original side is `N,0` and the hunk inserts lines between N and N+1.
    if (hunk.originalSize === 0) return ol > hunk.originalStart;
    // Case 2: Modifications and deletions
    // The original side is `N,size` and the hunk modifies 'size' lines starting from N.
    return ol >= hunk.originalStart + hunk.originalSize;
  }

  /**
   * Returns whether the comment is in the range between
   * minimum (inclusive) and maximum (exclusive).
   */
  private withinRange(minimum: number, maximum: number): boolean {
    const ol = this.originalLine;
    return ol !== undefined && ol >= minimum && ol < maximum;
  }

  /**
   * Creates the comment thread in the UI.
   */
  createVscodeCommentThread(
    controller: vscode.CommentController,
    gitDir: string,
    path: string,
    shift: number
  ): VscodeCommentThread {
    const dataUri = this.getDataUri(gitDir, path);
    const vscodeCommentThread = controller.createCommentThread(
      dataUri,
      // Decorated later.
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
      []
    ) as VscodeCommentThread;

    this.decorateVscodeCommentThread(vscodeCommentThread, shift, false);
    return vscodeCommentThread;
  }

  decorateVscodeCommentThread(
    vscodeCommentThread: VscodeCommentThread,
    shift: number,
    editing: boolean
  ): void {
    const range = this.getVscodeRange(shift);
    const comments = this.comments.map((comment, i) =>
      toVscodeComment(comment, editing && i === this.comments.length - 1)
    );
    const canReply = this.canReply;
    const [label, collapsibleState, state] = this.unresolved
      ? [
          `Patchset ${this.revisionNumber} / Unresolved`,
          vscode.CommentThreadCollapsibleState.Expanded,
          vscode.CommentThreadState.Unresolved,
        ]
      : [
          `Patchset ${this.revisionNumber} / Resolved`,
          vscode.CommentThreadCollapsibleState.Collapsed,
          vscode.CommentThreadState.Resolved,
        ];
    const contextValue = this.getContextValue();

    // Update fields only when necessary so that the focus is not stolen.
    // https://github.com/microsoft/vscode/issues/182060
    // Use one letter variable to hopefully make repetitive code more readable.
    const t = vscodeCommentThread;

    if (!t.range.isEqual(range)) t.range = range;
    if (
      t.comments.length !== comments.length ||
      !t.comments.every((c, i) => {
        const c2 = comments[i];
        return (
          (c as VscodeComment).gerritComment.isEqual(c2.gerritComment) &&
          c.contextValue === c2.contextValue
        );
      })
    ) {
      t.comments = comments;
    }
    if (t.canReply !== canReply) t.canReply = canReply;
    if (t.label !== label) t.label = label;
    if (t.collapsibleState !== collapsibleState) {
      t.collapsibleState = collapsibleState;
    }
    if (t.state !== state) t.state = state;
    if (t.contextValue !== contextValue) t.contextValue = contextValue;

    // It's safe to update custom fields unconditionally.
    t.gerritCommentThread = this;
  }

  private getDataUri(gitDir: string, filePath: string): vscode.Uri {
    if (filePath === '/COMMIT_MSG') {
      return gitDocument.commitMessageUri(
        gitDir,
        this.localCommitId,
        'gerrit commit msg'
      );
    } else if (filePath === '/PATCHSET_LEVEL') {
      return virtualDocument.patchSetUri(gitDir, this.changeId);
    } else {
      return vscode.Uri.file(path.join(gitDir, filePath));
    }
  }

  /** Gets vscode.Range for the comment. */
  private getVscodeRange(shift: number): vscode.Range {
    const r = this.range(shift);
    if (r !== undefined) {
      // Comment thread for some range
      // VSCode is 0-base, whereas Gerrit has 1-based lines and 0-based columns.
      return new vscode.Range(
        r.start_line - 1,
        r.start_character,
        r.end_line - 1,
        r.end_character
      );
    }
    const l = this.line(shift);
    if (l !== undefined) {
      // Comment thread for a line
      return new vscode.Range(l - 1, 0, l - 1, 0);
    }
    // Comment thread for the entire file
    return new vscode.Range(0, 0, 0, 0);
  }

  /**
   * Examples of the return value:
   * - "<public><resolved>"
   * - "<draft><unresolved>"
   *
   * public/draft indicates whether the thread (the first comment) has been
   * published or not.
   * resolved/unresolved indicates whether the thread is resolved or not.
   */
  private getContextValue(): string {
    const publicOrDraft = getCommentContextValue(
      this.firstComment.commentInfo,
      /* editing = */ false
    );
    const resolvedOrNot = this.lastComment.commentInfo.unresolved
      ? '<unresolved>'
      : '<resolved>';
    return publicOrDraft + resolvedOrNot;
  }
}

/** vscode.CommentThread extended with a reference to CommentThread */
export interface VscodeCommentThread extends vscode.CommentThread {
  /**
   * Reference to the comment thread, which we can use in
   * event callbacks on the VS Code comment thread
   */
  gerritCommentThread: CommentThread;
}
