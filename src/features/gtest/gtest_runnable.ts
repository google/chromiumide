// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import type {GtestCase} from './gtest_case';

/**
 * Abstract base class for all Gtest item wrappers. It provides convenience methods to query all
 * children, as well as for generating Gtest filters.
 */
export abstract class GtestRunnable implements vscode.Disposable {
  dispose(): void {
    for (const child of this.getChildren()) {
      child.dispose();
    }

    if (this.item.parent) {
      this.item.parent.children.delete(this.item.id);
    } else {
      // If an item doesn't have a parent, then it must be one of the top-level items.
      this.controller.items.delete(this.item.id);
    }
  }

  constructor(
    private readonly controller: vscode.TestController,
    readonly item: vscode.TestItem,
    readonly uri: vscode.Uri
  ) {}

  abstract getChildren(): GtestRunnable[];

  /**
   * Returns a filter suitable for the `--gtest_filter` parameter, assuming that `this` and all of
   * its children should be included in the test run.
   */
  abstract getGtestFilter(): string;

  /**
   * Returns a generator over all test cases matching the request.
   */
  abstract matchingTestCases(
    request: vscode.TestRunRequest,
    parentIsIncluded: boolean
  ): Generator<GtestCase, void, void>;
}
