// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

class FakeThread implements vscode.CommentThread {
  constructor(
    public uri: vscode.Uri,
    public range: vscode.Range,
    public comments: vscode.Comment[],
    public collapsibleState: vscode.CommentThreadCollapsibleState,
    public canReply: boolean,
    private readonly disposer: (thread: vscode.CommentThread) => void
  ) {}

  dispose(): void {
    this.disposer(this);
  }
}

/** Test fake for vscode.CommentController. */
export class FakeCommentController implements vscode.CommentController {
  readonly id = 'fakeCommentController';
  readonly label = 'Fake Comment Controller';

  private threadsInternal: vscode.CommentThread[] = [];

  get threads(): readonly vscode.CommentThread[] {
    return this.threadsInternal;
  }

  createCommentThread(
    uri: vscode.Uri,
    range: vscode.Range,
    comments: readonly vscode.Comment[]
  ): vscode.CommentThread {
    const thread = new FakeThread(
      uri,
      range,
      // Ensure tests are not inadvertently messing with the internals of this
      // directly; any writes should come from the code under test.
      [...comments],
      vscode.CommentThreadCollapsibleState.Collapsed,
      /* canReply= */ true,
      (thread: vscode.CommentThread) => {
        this.disposeThread(thread);
      }
    );

    this.threadsInternal.push(thread);

    return thread;
  }

  private disposeThread(thread: vscode.CommentThread) {
    const index = this.threadsInternal.indexOf(thread);
    if (index >= 0) {
      this.threadsInternal.splice(index, 1);
    }
  }

  clearThreads(): void {
    this.threadsInternal = [];
  }

  dispose(): void {}
}
