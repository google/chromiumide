// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as config from '../../../../services/config';
import {VIRTUAL_BOARDS_HOST, ViewItemContext} from '../constant';
import {Context} from '../context';
import {listPackages, type Package} from '../package';
import {Breadcrumbs} from './breadcrumbs';
import {Item} from './item';
import {PackageCategoryItem} from './package_category_item';

export class BoardItem implements Item {
  readonly breadcrumbs;
  readonly treeItem;
  readonly children: Item[] = [];

  constructor(parent: Breadcrumbs, private readonly board: string) {
    this.breadcrumbs = parent.pushed(board);

    const treeItem = new vscode.TreeItem(
      board,
      vscode.TreeItemCollapsibleState.Collapsed
    );

    if (board === VIRTUAL_BOARDS_HOST) {
      treeItem.iconPath = new vscode.ThemeIcon('device-desktop');
    } else {
      treeItem.iconPath = new vscode.ThemeIcon('circuit-board');
    }

    if (config.board.get() === board) {
      treeItem.description = 'default';
    }

    treeItem.contextValue = ViewItemContext.BOARD;

    this.treeItem = treeItem;
  }

  async refreshChildren(ctx: Context): Promise<void | Error> {
    const packages = await listPackages(ctx, this.board);
    if (packages instanceof Error) return packages;

    const categoryToPackages = new Map<string, Package[]>();

    for (const pkg of packages) {
      if (!categoryToPackages.has(pkg.category)) {
        categoryToPackages.set(pkg.category, []);
      }
      categoryToPackages.get(pkg.category)?.push(pkg);
    }

    const categories = [...categoryToPackages.keys()];
    categories.sort();

    this.children.splice(0);

    for (const category of categories) {
      this.children.push(
        new PackageCategoryItem(
          this.breadcrumbs,
          category,
          categoryToPackages.get(category)!
        )
      );
    }
  }
}
