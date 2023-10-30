// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export class TestItemCollection implements vscode.TestItemCollection {
  [Symbol.iterator](): Iterator<
    [id: string, testItem: vscode.TestItem],
    unknown,
    undefined
  > {
    return this.idToItem.entries();
  }

  private readonly idToItem = new Map<string, vscode.TestItem>();

  get size(): number {
    return this.idToItem.size;
  }

  add(item: vscode.TestItem): void {
    this.idToItem.set(item.id, item);
  }

  delete(itemId: string): void {
    this.idToItem.delete(itemId);
  }

  forEach(
    callback: (
      item: vscode.TestItem,
      collection: vscode.TestItemCollection
    ) => unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thisArg?: any
  ): void {
    for (const item of this.idToItem.values()) {
      if (thisArg) {
        callback.bind(thisArg)(item, this);
      } else {
        callback(item, this);
      }
    }
  }

  get(itemId: string): vscode.TestItem {
    return this.idToItem.get(itemId)!;
  }

  replace(items: readonly vscode.TestItem[]): void {
    this.idToItem.clear();
    for (const item of items) {
      this.add(item);
    }
  }
}
