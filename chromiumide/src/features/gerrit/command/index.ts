// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../../../common/vscode/commands';
import {VscodeComment, VscodeCommentThread} from '../data';
import {CommandContext} from './context';
import {discardDraft, reply, updateDraft} from './draft';

export enum CommandName {
  DISCARD_DRAFT = 'chromiumide.gerrit.discardDraft',
  EDIT_DRAFT = 'chromiumide.gerrit.editDraft',
  EDIT_DRAFT_CANCEL = 'chromiumide.gerrit.editDraftCancel',
  EDIT_DRAFT_REPLY = 'chromiumide.gerrit.editDraftReply',
  EDIT_DRAFT_REPLY_AND_RESOLVE = 'chromiumide.gerrit.editDraftReplyAndResolve',
  EDIT_DRAFT_REPLY_AND_UNRESOLVE = 'chromiumide.gerrit.editDraftReplyAndUnresolve',
  REPLY = 'chromiumide.gerrit.reply',
  REPLY_AND_RESOLVE = 'chromiumide.gerrit.replyAndResolve',
  REPLY_AND_UNRESOLVE = 'chromiumide.gerrit.replyAndUnresolve',
}

/**
 * Register all the commands for the gerrit support on instantiation and unregister them on dispose.
 */
export class GerritCommands implements vscode.Disposable {
  private readonly onDidExecuteCommandEmitter =
    new vscode.EventEmitter<CommandName>();
  /** Emits the command name after the callback of the command is fulfilled. */
  readonly onDidExecuteCommand = this.onDidExecuteCommandEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidExecuteCommandEmitter,
  ];

  constructor(ctx: CommandContext) {
    this.subscriptions.push(
      this.register(CommandName.REPLY, ({thread, text}: vscode.CommentReply) =>
        reply(ctx, thread as VscodeCommentThread, text)
      ),
      this.register(
        CommandName.REPLY_AND_RESOLVE,
        ({thread, text}: vscode.CommentReply) =>
          reply(
            ctx,
            thread as VscodeCommentThread,
            text,
            /* unresolved = */ false
          )
      ),
      this.register(
        CommandName.REPLY_AND_UNRESOLVE,
        ({thread, text}: vscode.CommentReply) =>
          reply(
            ctx,
            thread as VscodeCommentThread,
            text,
            /* unresolved = */ true
          )
      ),
      this.register(CommandName.DISCARD_DRAFT, (comment: VscodeComment) =>
        discardDraft(ctx, comment)
      ),
      this.register(
        CommandName.EDIT_DRAFT,
        ({gerritComment: {commentId}}: VscodeComment) =>
          ctx.editingStatus.add(commentId, 'start-edit')
      ),
      this.register(
        CommandName.EDIT_DRAFT_CANCEL,
        ({gerritComment: {commentId}}: VscodeComment) =>
          ctx.editingStatus.delete(commentId, 'cancel-edit')
      ),
      this.register(CommandName.EDIT_DRAFT_REPLY, (comment: VscodeComment) =>
        updateDraft(ctx, comment)
      ),
      this.register(
        CommandName.EDIT_DRAFT_REPLY_AND_RESOLVE,
        (comment: VscodeComment) =>
          updateDraft(ctx, comment, /* unresolved = */ false)
      ),
      this.register(
        CommandName.EDIT_DRAFT_REPLY_AND_UNRESOLVE,
        (comment: VscodeComment) =>
          updateDraft(ctx, comment, /* unresolved = */ true)
      )
    );
  }

  private register<T>(
    command: CommandName,
    callback: (args: T) => Thenable<void> | void
  ): vscode.Disposable {
    return vscodeRegisterCommand(command, async (args: T) => {
      await callback(args);
      this.onDidExecuteCommandEmitter.fire(command);
    });
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.splice(0).reverse()).dispose();
  }
}
