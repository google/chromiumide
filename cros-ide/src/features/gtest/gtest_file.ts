// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {GtestCase} from './gtest_case';
import * as parser from './parser';

/**
 * Represents a unit test file containing at least one gtest test case.
 */
export class GtestFile implements vscode.Disposable {
  private readonly cases: GtestCase[] = [];
  private readonly item: vscode.TestItem;

  private constructor(
    private readonly controller: vscode.TestController,
    uri: vscode.Uri,
    testSuiteMap: parser.TestSuiteMap
  ) {
    if (testSuiteMap.size === 0) {
      throw new Error('Internal error: testSuiteMap must not be empty');
    }

    this.item = this.controller.createTestItem(
      uri.toString(),
      uri.path.split('/').pop()!,
      uri
    );
    this.controller.items.add(this.item);

    for (const [suite, {cases, isParametrized}] of testSuiteMap.entries()) {
      for (const [name, {range}] of cases.entries()) {
        const testCase = new GtestCase(
          this.controller,
          this.item,
          uri,
          range,
          suite,
          name,
          isParametrized
        );
        this.cases.push(testCase);
      }
    }
  }

  static createIfHasTest(
    getOrCreateController: () => vscode.TestController,
    uri: vscode.Uri,
    content: string
  ): GtestFile | undefined {
    const testSuiteMap = parser.parse(content);
    if (testSuiteMap.size === 0) {
      return undefined;
    }
    return new GtestFile(getOrCreateController(), uri, testSuiteMap);
  }

  dispose() {
    for (const testCase of this.cases) {
      testCase.dispose();
    }
    this.cases.splice(0);

    if (this.item) {
      this.controller.items.delete(this.item.id);
    }
  }

  /**
   * Executes f on all the test cases matching the request.
   */
  async forEachMatching(
    request: vscode.TestRunRequest,
    f: (testCase: GtestCase) => Thenable<void>
  ) {
    if (request.exclude?.includes(this.item)) {
      return;
    }

    const runAll = request.include?.includes(this.item);

    for (const testCase of this.cases) {
      if (
        !runAll &&
        request.include &&
        !request.include.includes(testCase.item)
      ) {
        continue;
      }
      if (request.exclude?.includes(testCase.item)) {
        continue;
      }
      await f(testCase);
    }
  }
}
