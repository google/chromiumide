// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as api from '../api';
import * as auth from '../auth';
import {Comment, VscodeComment, VscodeCommentThread} from '../data';
import {RepoId} from '../git';
import {CommandContext} from './context';

export async function reply(
  ctx: CommandContext,
  thread: VscodeCommentThread,
  message: string,
  unresolved?: boolean
): Promise<void> {
  const {
    repoId,
    changeId,
    lastComment: {commentId},
    changeNumber,
    revisionNumber,
    filePath,
  } = thread.gerritCommentThread;
  const authCookie = await getAuthCookie(ctx, repoId);
  if (!authCookie) return;

  // Comment shown until real draft is fetched from Gerrit.
  const tentativeComment: VscodeComment = {
    body: message,
    mode: vscode.CommentMode.Preview,
    author: {name: 'Draft being created'},
    gerritComment: new Comment(repoId, changeNumber, {
      isPublic: true,
      author: {
        _account_id: 0,
      },
      in_reply_to: commentId,
      id: '',
      updated: 'now',
      message,
    }),
  };

  thread.comments = [...thread.comments, tentativeComment];
  thread.canReply = false;

  try {
    await api.createDraftOrThrow(
      repoId,
      authCookie,
      changeId,
      revisionNumber.toString(),
      {
        in_reply_to: commentId,
        path: filePath,
        message,
        unresolved,
      },
      ctx.sink
    );
  } catch (e) {
    const err = e as Error;
    const message = `Failed to create draft: ${err}`;
    ctx.sink.show({
      log: message,
      metrics: message,
      noErrorStatus: true,
    });
    void vscode.window.showErrorMessage(message);
  }
}

export async function discardDraft(
  ctx: CommandContext,
  comment: VscodeComment
): Promise<void> {
  const thread = ctx.getCommentThread(comment);
  if (!thread) return;
  const {
    repoId,
    changeId,
    lastComment: {commentId},
    revisionNumber,
  } = thread.gerritCommentThread;

  const authCookie = await getAuthCookie(ctx, repoId);
  if (!authCookie) return;

  try {
    await api.deleteDraftOrThrow(
      repoId,
      authCookie,
      changeId,
      revisionNumber.toString(),
      commentId,
      ctx.sink
    );
  } catch (e) {
    const message = `Failed to discard draft: ${e}`;
    ctx.sink.show({
      log: message,
      metrics: message,
      noErrorStatus: true,
    });
    void vscode.window.showErrorMessage(message);
    return;
  }

  thread.comments = thread.comments.slice(0, thread.comments.length - 1);
}

export async function updateDraft(
  ctx: CommandContext,
  comment: VscodeComment,
  unresolved?: boolean
): Promise<void> {
  const thread = ctx.getCommentThread(comment);
  if (!thread) return;

  const {
    repoId,
    changeId,
    lastComment: {
      commentId,
      commentInfo: {
        in_reply_to: inReplyTo,
        updated,
        unresolved: currentUnresolved,
      },
    },
    changeNumber,
    revisionNumber,
    filePath,
  } = thread.gerritCommentThread;

  if (unresolved === undefined) {
    unresolved = currentUnresolved;
  }

  const authCookie = await getAuthCookie(ctx, repoId);
  if (!authCookie) return;

  const message =
    typeof comment.body === 'string' ? comment.body : comment.body.value;

  try {
    await api.updateDraftOrThrow(
      repoId,
      authCookie,
      changeId,
      revisionNumber.toString(),
      commentId,
      {
        message,
        id: commentId,
        path: filePath,
        in_reply_to: inReplyTo,
        unresolved,
      },
      ctx.sink
    );
  } catch (e) {
    const message = `Failed to update draft: ${e}`;
    ctx.sink.show({
      log: message,
      metrics: message,
      noErrorStatus: true,
    });
    void vscode.window.showErrorMessage(message);
    return;
  }

  thread.comments = [
    ...thread.comments.slice(0, thread.comments.length - 1),
    // Comment shown until real draft is fetched from Gerrit.
    {
      body: new vscode.MarkdownString(message),
      mode: vscode.CommentMode.Preview,
      author: {name: 'Draft being created'},
      gerritComment: new Comment(repoId, changeNumber, {
        isPublic: true,
        author: {
          _account_id: 0,
        },
        in_reply_to: inReplyTo,
        id: commentId,
        updated,
        message,
      }),
    } as VscodeComment,
  ];

  ctx.editingStatus.delete(commentId, 'update-draft');
}

async function getAuthCookie(
  ctx: CommandContext,
  repoId: RepoId
): Promise<string | undefined> {
  const authCookie = await auth.readAuthCookie(repoId, ctx.sink);
  if (!authCookie) {
    void (async () => {
      const choice = await vscode.window.showErrorMessage(
        'Failed to read auth cookie; confirm your .gitcookies is properly set up and you can run repo upload',
        'Open document'
      );
      if (choice) {
        await vscode.env.openExternal(
          vscode.Uri.parse(
            'https://www.chromium.org/chromium-os/developer-guide/gerrit-guide'
          )
        );
      }
    })();
    return undefined;
  }
  return authCookie;
}
