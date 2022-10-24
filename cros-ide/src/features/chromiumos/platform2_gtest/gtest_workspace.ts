// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {Config} from './config';
import {GtestFile} from './gtest_file';

/**
 * Manages platform2 unit test files using gtest found in the workspace.
 */
export class GtestWorkspace implements vscode.Disposable {
  private readonly uriToGtestFile = new Map<string, GtestFile>();
  private readonly subscriptions: vscode.Disposable[] = [];

  dispose() {
    for (const testFile of this.uriToGtestFile.values()) {
      testFile.dispose();
    }
    this.uriToGtestFile.clear();
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  constructor(private readonly cfg: Config) {
    // TODO(oka): Observe change of visible text editors instead of text
    // documents, which are opened on file hovers for example.
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(e => {
        this.update(e);
      })
    );
    this.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument(e => {
        this.update(e, /* remove = */ true);
      })
    );
    this.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        this.update(e.document);
      })
    );

    // setImmediate is needed to make sure RunProfile receives
    // TestControllerSingleton's onDidCreate event.
    setImmediate(() =>
      vscode.window.visibleTextEditors.map(e => this.update(e.document))
    );
  }

  private update(document: vscode.TextDocument, remove?: boolean) {
    if (!this.shouldHandle(document)) {
      return;
    }
    const key = document.uri.toString();

    const prev = this.uriToGtestFile.get(key);
    if (prev) {
      prev.dispose();
      this.uriToGtestFile.delete(key);
    }

    if (remove) {
      return;
    }

    const content = document.getText();

    const gtestFile = GtestFile.createIfHasTest(
      this.cfg,
      document.uri,
      content
    );
    if (!gtestFile) {
      return;
    }

    this.uriToGtestFile.set(key, gtestFile);
  }

  private shouldHandle(e: vscode.TextDocument) {
    return (
      e.uri.scheme === 'file' &&
      !path.relative(this.cfg.platform2, e.fileName).startsWith('..') &&
      e.fileName.match(/_(unit)?test.(cc|cpp)$/)
    );
  }
}
