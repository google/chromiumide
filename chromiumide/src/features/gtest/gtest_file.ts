// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {GtestCase} from './gtest_case';
import {GtestRunnable} from './gtest_runnable';
import {GtestSuite} from './gtest_suite';
import * as parser from './parser';

/**
 * Represents a test file containing at least one test suite with a test case.
 */
export class GtestFile extends GtestRunnable {
  readonly testSuites: GtestSuite[] = [];

  override dispose(): void {
    super.dispose();
    this.testSuites.splice(0);
  }

  private constructor(
    controller: vscode.TestController,
    uri: vscode.Uri,
    testSuiteMap: parser.TestSuiteMap
  ) {
    if (testSuiteMap.size === 0) {
      throw new Error('Internal error: testSuiteMap must not be empty');
    }

    const item = controller.createTestItem(
      /*id=*/ uri.toString(),
      /*label=*/ path.basename(uri.fsPath),
      uri
    );
    controller.items.add(item);
    super(controller, item, uri);

    for (const [suite, {range, cases, isTyped}] of testSuiteMap.entries()) {
      const testSuite = new GtestSuite(
        controller,
        item,
        uri,
        range,
        suite,
        isTyped,
        cases
      );
      this.testSuites.push(testSuite);
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

  override getChildren(): GtestSuite[] {
    return this.testSuites;
  }

  override getGtestFilter(): string {
    // Unfortunately, gtest does not allow to filter by filename.
    return this.testSuites
      .map(testSuite => testSuite.getGtestFilter())
      .join(':');
  }

  /**
   * Returns a generator over all test cases matching the request.
   */
  override *matchingTestCases(
    request: vscode.TestRunRequest,
    parentIsIncluded: boolean
  ): Generator<GtestCase, void, void> {
    if (request.exclude?.includes(this.item)) {
      return;
    }

    const include =
      parentIsIncluded ||
      !request.include ||
      request.include.includes(this.item);

    for (const testSuite of this.testSuites) {
      yield* testSuite.matchingTestCases(request, include);
    }
  }
}
