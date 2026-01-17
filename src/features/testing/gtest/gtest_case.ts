// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {GtestRunnable} from './gtest_runnable';
import type {GtestSuite} from './gtest_suite';

/**
 * Represents one gtest test case.
 */
export class GtestCase extends GtestRunnable {
  constructor(
    controller: vscode.TestController,
    private readonly testSuite: GtestSuite,
    range: vscode.Range,
    private readonly caseName: string,
    readonly isParameterized: boolean
  ) {
    const item = controller.createTestItem(
      /*id=*/ `case:${caseName}`,
      /*label=*/ caseName,
      testSuite.uri
    );
    item.range = range;
    testSuite.item.children.add(item);
    super(controller, item, testSuite.uri);
  }

  get suiteAndCaseName(): string {
    return `${this.testSuite.suiteName}.${this.caseName}`;
  }

  override getChildren(): [] {
    // A test case currently does not have children.
    // TODO(cmfcmf): It will have children once we properly support parameterized tests.
    return [];
  }

  override getGtestFilter(): string {
    const suiteName = this.testSuite.suiteName;
    if (this.isParameterized) {
      // Parameterized tests may or may not have a prefix.
      return this.testSuite.isTyped
        ? `*/${suiteName}/*.${this.caseName}:${suiteName}/*.${this.caseName}`
        : `*/${suiteName}.${this.caseName}/*:${suiteName}.${this.caseName}/*`;
    } else {
      return this.testSuite.isTyped
        ? `${suiteName}/*.${this.caseName}`
        : `${suiteName}.${this.caseName}`;
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

    if (include) {
      yield this;
    }
  }
}
