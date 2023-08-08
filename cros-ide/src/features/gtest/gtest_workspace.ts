// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {GtestCase} from './gtest_case';
import {GtestFile} from './gtest_file';

/**
 * Manages unit test files using gtest found in the workspace.
 */
export class GtestWorkspace implements vscode.Disposable {
  private readonly uriToGtestFile = new Map<string, GtestFile>();
  private readonly subscriptions: vscode.Disposable[] = [];

  dispose(): void {
    for (const testFile of this.uriToGtestFile.values()) {
      testFile.dispose();
    }
    this.uriToGtestFile.clear();
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  /**
   * @param getOrCreateController A function that returns a `vscode.TestController` when invoked.
   * @param rootDir Only tests in files under this directory are parsed for tests.
   */
  constructor(
    private readonly getOrCreateController: () => vscode.TestController,
    private readonly rootDir: string
  ) {
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
      this.getOrCreateController,
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
      !path.relative(this.rootDir, e.fileName).startsWith('..') &&
      e.fileName.match(/_(unit|browser|api)?test.(cc|cpp)$/)
    );
  }

  /**
   * Returns a generator over all test cases matching the request.
   */
  *matchingTestCases(
    request: vscode.TestRunRequest
  ): Generator<GtestCase, void, void> {
    for (const testFile of this.uriToGtestFile.values()) {
      yield* testFile.matchingTestCases(request, /*parentIsIncluded=*/ false);
    }
  }
}
