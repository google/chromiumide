// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ViewItemContext} from '../constant';
import {Context} from '../context';
import {Breadcrumbs} from './breadcrumbs';
import {Item} from './item';
import {PackageWithPreference, PackageNameItem} from './package_name_item';

export class PackageCategoryItem implements Item {
  readonly breadcrumbs;
  readonly treeItem;
  readonly children;

  constructor(
    parent: Breadcrumbs,
    category: string,
    favorite: boolean,
    packages: PackageWithPreference[]
  ) {
    this.breadcrumbs = parent.pushed(category);
    this.treeItem = new vscode.TreeItem(
      category,
      vscode.TreeItemCollapsibleState.Collapsed
    );

    this.treeItem.contextValue = favorite
      ? ViewItemContext.CATEGORY_FAVORITE
      : ViewItemContext.CATEGORY;

    if (favorite) {
      this.treeItem.description = '★';
    }

    this.children = [];
    for (const pkg of packages) {
      this.children.push(new PackageNameItem(this.breadcrumbs, pkg));
    }
  }

  async refreshChildren(_ctx: Context): Promise<void> {}
}
