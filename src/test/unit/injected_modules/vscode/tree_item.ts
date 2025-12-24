// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {TreeItemCollapsibleState} from './tree_item_collapsible_state';
import {TreeItemLabel} from './tree_item_label';
import type * as vscode from 'vscode';

export class TreeItem implements vscode.TreeItem {
  label?: string | TreeItemLabel;
  collapsibleState?: TreeItemCollapsibleState;

  constructor(
    label: string | TreeItemLabel,
    collapsibleState?: TreeItemCollapsibleState
  ) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}
