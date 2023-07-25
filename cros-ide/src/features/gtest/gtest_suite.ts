// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {GtestCase} from './gtest_case';
import {GtestRunnable} from './gtest_runnable';
import * as parser from './parser';

/**
 * Represents one gtest test suite.
 */
export class GtestSuite extends GtestRunnable {
  readonly testCases: GtestCase[] = [];

  override dispose() {
    super.dispose();
    this.testCases.splice(0);
  }

  constructor(
    controller: vscode.TestController,
    testFileItem: vscode.TestItem,
    uri: vscode.Uri,
    range: vscode.Range,
    readonly suiteName: string,
    readonly isParameterized: boolean,
    readonly isTyped: boolean,
    cases: parser.TestCaseMap
  ) {
    const item = controller.createTestItem(
      /*id=*/ `suite:${suiteName}`,
      /*label=*/ suiteName,
      uri
    );
    item.range = range;
    testFileItem.children.add(item);

    super(controller, item, uri);
    for (const [name, {range}] of cases.entries()) {
      const testCase = new GtestCase(controller, this, range, name);
      this.testCases.push(testCase);
    }
  }

  override getChildren(): GtestCase[] {
    return this.testCases;
  }

  override getGtestFilter(): string {
    if (this.isParameterized) {
      // Parameterized tests may or may not have a prefix.
      return this.isTyped
        ? `*/${this.suiteName}/*.*:${this.suiteName}/*.*`
        : `*/${this.suiteName}.*/*:${this.suiteName}.*/*`;
    } else {
      return this.isTyped ? `${this.suiteName}/*.*` : `${this.suiteName}.*`;
    }
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

    for (const testCase of this.testCases) {
      yield* testCase.matchingTestCases(request, include);
    }
  }
}
