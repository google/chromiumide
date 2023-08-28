// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ChrootService} from '../../../services/chromiumos';
import {Breadcrumbs, searchItem, RootItem, Item} from './item';

export class BoardsAndPackagesTreeDataProvider
  implements vscode.TreeDataProvider<Breadcrumbs>
{
  private onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    Breadcrumbs | undefined | null | void
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private readonly root = new RootItem();

  constructor(
    private readonly chrootService: ChrootService,
    private readonly output: vscode.OutputChannel
  ) {}

  async getTreeItem(breadcrumbs: Breadcrumbs): Promise<vscode.TreeItem> {
    return (await this.getItem(breadcrumbs)).treeItem;
  }

  private async getItem(breadcrumbs: Breadcrumbs): Promise<Item> {
    const item = searchItem(this.root, breadcrumbs);
    if (item) {
      return item;
    }

    // Instantiate parent items recursively.
    const parentItem = await this.getItem(breadcrumbs.parent());

    // Instantiate the parent's children.
    await this.getChildren(parentItem.breadcrumbs);

    return searchItem(this.root, breadcrumbs)!;
  }

  getParent(breadcrumbs: Breadcrumbs): Breadcrumbs | undefined {
    const parent = breadcrumbs.parent();
    // Returns undefined for the root item, that has an empty breadcrumbs.
    return parent?.length ? parent : undefined;
  }

  async getChildren(
    breadcrumbs?: Breadcrumbs | undefined
  ): Promise<Breadcrumbs[]> {
    const item = breadcrumbs ? searchItem(this.root, breadcrumbs)! : this.root;

    const ctx = {
      chrootService: this.chrootService,
      output: this.output,
    };

    const error = await item.refreshChildren(ctx);
    if (error instanceof Error) {
      void vscode.window.showErrorMessage(error.message);
    }

    return item.children.map(x => x.breadcrumbs);
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }
}
