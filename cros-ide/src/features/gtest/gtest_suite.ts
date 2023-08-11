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

  override dispose(): void {
    super.dispose();
    this.testCases.splice(0);
  }

  constructor(
    controller: vscode.TestController,
    testFileItem: vscode.TestItem,
    uri: vscode.Uri,
    range: vscode.Range,
    readonly suiteName: string,
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
    for (const [name, {range, isParameterized}] of cases.entries()) {
      const testCase = new GtestCase(
        controller,
        this,
        range,
        name,
        isParameterized
      );
      this.testCases.push(testCase);
    }
  }

  override getChildren(): GtestCase[] {
    return this.testCases;
  }

  override getGtestFilter(): string {
    const filters = new Set<string>();

    let hasParameterizedCase = false;
    let hasNonParameterizedCase = false;
    for (const testCase of this.testCases) {
      if (testCase.isParameterized) {
        hasParameterizedCase = true;
      } else {
        hasNonParameterizedCase = true;
      }
    }

    if (hasParameterizedCase) {
      // Parameterized tests may or may not have a prefix.
      for (const filter of this.isTyped
        ? [`*/${this.suiteName}/*.*`, `${this.suiteName}/*.*`]
        : [`*/${this.suiteName}.*/*`, `${this.suiteName}.*/*`]) {
        filters.add(filter);
      }
    }
    if (hasNonParameterizedCase) {
      filters.add(
        this.isTyped ? `${this.suiteName}/*.*` : `${this.suiteName}.*`
      );
    }
    return Array.from(filters).join(':');
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
