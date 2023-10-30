// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

/**
 * Manages the set of open text editors which have been activated at least one,
 * and emits an event when the set changes.
 *
 * Note, VSCode does have onDidOpenTextDocument, but it fires for various
 * surprising events (e.g., Ctrl + hovering mouse over class names),
 * hence the need for this class.
 */
export class TextEditorsWatcher implements vscode.Disposable {
  private readonly onDidActivateEmitter =
    new vscode.EventEmitter<vscode.TextDocument>();

  /**
   * Fired with the TextDocument of the opened text editor.
   *
   * It will be fired only once for the same text editor,
   * unless it is closed before the second activation.
   */
  readonly onDidActivate = this.onDidActivateEmitter.event;

  private readonly onDidCloseEmitter =
    new vscode.EventEmitter<vscode.TextDocument>();

  /**
   * Fired with the TextDocument that was closed.
   *
   * Similarly to `onDidActivate`. It can be fired again,
   * if the documents is opened and closed again.
   */
  readonly onDidClose = this.onDidCloseEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidActivateEmitter,
    this.onDidCloseEmitter,
  ];

  private constructor() {
    const alreadyActivated = new Set<string>();
    if (vscode.window.activeTextEditor) {
      const doc = vscode.window.activeTextEditor.document;
      alreadyActivated.add(doc.uri.toString());
    }

    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) {
          return;
        }

        const doc = editor.document;
        const uriString = doc.uri.toString();
        if (!alreadyActivated.has(uriString)) {
          alreadyActivated.add(uriString);
          this.onDidActivateEmitter.fire(doc);
        }
      }),

      vscode.workspace.onDidCloseTextDocument(doc => {
        if (alreadyActivated.delete(doc.uri.toString())) {
          this.onDidCloseEmitter.fire(doc);
        }
      })
    );
  }

  private static instance?: TextEditorsWatcher;

  static singleton(): TextEditorsWatcher {
    if (!TextEditorsWatcher.instance) {
      TextEditorsWatcher.instance = new TextEditorsWatcher();
    }
    return TextEditorsWatcher.instance;
  }

  static createForTesting(): TextEditorsWatcher {
    return new TextEditorsWatcher();
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }
}
