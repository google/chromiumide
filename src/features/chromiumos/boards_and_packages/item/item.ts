// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Context} from '../context';
import type {Breadcrumbs} from './breadcrumbs';
import type * as vscode from 'vscode';

/**
 * Represents an item shown on the view.
 */
export interface Item {
  /**
   * The breadcrumbs to make the item efficiently searchable from the root with
   * the `searchItem` function. It is typically created by calling `pushed` on
   * the parent's breadcrumbs.
   */
  readonly breadcrumbs: Breadcrumbs;

  /**
   * TreeItem corresponding to the item. It will never be used for the root
   * item, but it's non optional for implementation's simplicity.
   */
  readonly treeItem: vscode.TreeItem;
  readonly children: readonly Item[];

  /** Refresh children, non recursively. */
  refreshChildren(ctx: Context): Promise<void | Error>;
}

/** Finds the item matching the breadcrumbs under the root. */
export function searchItem(
  root: Item,
  breadcrumbs: Breadcrumbs
): Item | undefined {
  if (!breadcrumbs.startsWith(root.breadcrumbs)) {
    return undefined;
  }
  if (breadcrumbs.length === root.breadcrumbs.length) {
    return root;
  }
  for (const child of root.children) {
    const res = searchItem(child, breadcrumbs);
    if (res) {
      return res;
    }
  }
  return undefined;
}
