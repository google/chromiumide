// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {TestItem} from './test_item';
import {TestItemCollection} from './test_item_collecion';
import {TestRun} from './test_run';
import {TestRunProfile} from './test_run_profile';
import type * as vscode from 'vscode';

export function createTestController(
  id: string,
  label: string
): vscode.TestController {
  return new TestController(id, label);
}

class TestController implements vscode.TestController {
  constructor(readonly id: string, public label: string) {}

  readonly resolveHandler = undefined;
  readonly refreshHandler = undefined;

  readonly items = new TestItemCollection();

  createRunProfile(
    label: string,
    kind: vscode.TestRunProfileKind,
    runHandler: (
      request: vscode.TestRunRequest,
      token: vscode.CancellationToken
    ) => void | Thenable<void>,
    isDefault?: boolean,
    tag?: vscode.TestTag
  ): vscode.TestRunProfile {
    return new TestRunProfile(label, kind, runHandler, !!isDefault, tag);
  }

  readonly resolvedHandler?: (item: vscode.TestItem) => void | Thenable<void>;

  createTestItem(id: string, label: string, uri?: vscode.Uri): vscode.TestItem {
    return new TestItem(id, label, uri);
  }

  createTestRun(
    _request: vscode.TestRunRequest,
    name?: string,
    persist?: boolean
  ): vscode.TestRun {
    return new TestRun(name, !!persist);
  }

  dispose(): void {}
}
