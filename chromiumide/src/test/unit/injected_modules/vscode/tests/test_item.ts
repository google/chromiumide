// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {TestItemCollection} from './test_item_collecion';
import type * as vscode from 'vscode';

export class TestItem implements vscode.TestItem {
  constructor(
    readonly id: string,
    public label: string,
    readonly uri: vscode.Uri | undefined
  ) {}
  readonly children = new TestItemCollection();
  readonly parent: vscode.TestItem | undefined = undefined;

  tags: readonly vscode.TestTag[] = [];
  canResolveChildren = false;
  busy = false;
  description?: string;
  range: vscode.Range | undefined = undefined;
  error: string | vscode.MarkdownString | undefined = undefined;
}
