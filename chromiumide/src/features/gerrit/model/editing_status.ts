// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

/**
 * This class tracks which draft comments are currently being edited in the IDE and send an event
 * when the status changes.
 */
export class EditingStatus implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<
    {id: string} & (
      | {
          operation: 'add';
          reason: 'start-edit';
        }
      | {
          operation: 'delete';
          reason: 'cancel-edit' | 'update-draft';
        }
    )
  >();
  /** Called with the comment id whose editing status has changed and the reason of the change. */
  readonly onDidChange = this.onDidChangeEmitter.event;

  /**
   * The ids of the comments currently being edited.
   */
  private readonly editing = new Set<string>();

  /** Returns whether the comment with the id is being edited. */
  has(id: string): boolean {
    return this.editing.has(id);
  }

  /** Adds the comment id as being edited. */
  add(id: string, reason: 'start-edit'): void {
    if (this.editing.has(id)) {
      return;
    }
    this.editing.add(id);
    this.onDidChangeEmitter.fire({id, operation: 'add', reason});
  }

  /** Deletes the comment id from being edited. */
  delete(id: string, reason: 'cancel-edit' | 'update-draft'): void {
    if (!this.editing.has(id)) {
      return;
    }
    this.editing.delete(id);
    this.onDidChangeEmitter.fire({id, operation: 'delete', reason});
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
