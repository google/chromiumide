// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../common/common_util';

/**
 * Represents a change on the set of the git directories computed from visible
 * text editors (including virtual documents).
 */
export type VisibleGitDirsChangeEvent = {
  /**
   * Abosolute paths to the added git directories.
   */
  readonly added: readonly string[];
  /**
   * Absolute paths to the removed git directories.
   */
  readonly removed: readonly string[];
};

export class Watcher {
  // Maps git directory to the uris of the visible text editors that open a file
  // under the directory.
  private readonly gitDirToDocUris = new Map<string, Set<string>>();

  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<VisibleGitDirsChangeEvent>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidChangeEmitter,
  ];
  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  /**
   * Git root directories computed from visible text editors.
   */
  get visibleGitDirs(): readonly string[] {
    return [...this.gitDirToDocUris.keys()];
  }

  constructor(private readonly root: string) {
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(e => this.add([e]))
    );
    this.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument(e => this.remove([e]))
    );

    setImmediate(() =>
      this.add(vscode.window.visibleTextEditors.map(e => e.document))
    );
  }

  private add(documents: vscode.TextDocument[]) {
    const added: string[] = [];
    documents.forEach(document => {
      const gitDir = this.gitDirFor(document);
      if (!gitDir) {
        return;
      }
      let docs = this.gitDirToDocUris.get(gitDir);
      if (!docs) {
        docs = new Set();
        this.gitDirToDocUris.set(gitDir, docs);
        added.push(gitDir);
      }
      docs.add(document.uri.toString());
    });
    if (added.length > 0) {
      this.onDidChangeEmitter.fire({added, removed: []});
    }
  }

  private remove(documents: vscode.TextDocument[]) {
    const removed: string[] = [];
    documents.forEach(document => {
      const gitDir = this.gitDirFor(document);
      if (!gitDir) {
        return;
      }
      const docs = this.gitDirToDocUris.get(gitDir);
      if (!docs) {
        // For robustness; this shouldn't actually happen.
        return;
      }
      docs.delete(document.uri.toString());
      if (docs.size === 0) {
        this.gitDirToDocUris.delete(gitDir);
        removed.push(gitDir);
      }
    });
    if (removed.length > 0) {
      this.onDidChangeEmitter.fire({added: [], removed});
    }
  }

  private gitDirFor(document: vscode.TextDocument): string | undefined {
    const isUnderRoot = !path
      .relative(this.root, document.fileName)
      .startsWith('..');
    if (!isUnderRoot) {
      return undefined;
    }
    return commonUtil.findGitDir(document.fileName);
  }
}
