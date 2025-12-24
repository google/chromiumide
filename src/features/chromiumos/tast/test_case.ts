// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {LazyTestController} from './lazy_test_controller';
import * as parser from './parser';

export class TestCase implements vscode.Disposable {
  readonly item: vscode.TestItem;

  /**
   * Creates an instance if the document contains a Tast test.
   */
  static maybeCreate(
    lazyTestController: LazyTestController,
    document: vscode.TextDocument
  ): TestCase | undefined {
    if (document.languageId !== 'go') {
      return;
    }
    const testCase = parser.parseTestCase(document);
    if (!testCase) {
      return undefined;
    }
    return new TestCase(lazyTestController, testCase, document.uri);
  }

  private readonly subscriptions: vscode.Disposable[] = [];

  private constructor(
    lazyTestController: LazyTestController,
    testCase: parser.ParsedTestCase,
    uri: vscode.Uri
  ) {
    const controller = lazyTestController.getOrCreate();

    const id = `${uri}/${testCase.name}`;
    this.item = controller.createTestItem(id, testCase.name, uri);
    this.item.range = testCase.range;

    controller.items.add(this.item);

    this.subscriptions.push(
      new vscode.Disposable(() => controller.items.delete(this.item.id))
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }
}
