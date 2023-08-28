// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {BoardOrHost} from '../../../../common/chromiumos/board_or_host';
import {getQualifiedPackageName} from '../../../../common/chromiumos/portage/ebuild';
import * as config from '../../../../services/config';
import {ViewItemContext} from '../constant';
import {Context} from '../context';
import {listPackages} from '../package';
import {Breadcrumbs} from './breadcrumbs';
import {Item} from './item';
import {PackageCategoryItem} from './package_category_item';
import {PackageWithPreference} from './package_name_item';

/**
 * This class represents a board item.
 *
 * Created class instances are cached so that it is guaranteed that two instances of this class
 * representing the same board item are identical, allowing already computed children of the item to
 * be shown while the children of the item are being recomputed.
 *
 * Tests that would use this class should clear the global cache before each test using
 * `clearCacheForTesting`.
 */
export class BoardItem implements Item {
  readonly breadcrumbs;
  readonly treeItem;
  readonly children: Item[] = [];

  private static readonly knownBoardItems = new Map<
    Breadcrumbs,
    Map<BoardOrHost, BoardItem>
  >();

  static create(parent: Breadcrumbs, board: BoardOrHost): BoardItem {
    const existing = this.knownBoardItems.get(parent)?.get(board);
    if (existing) return existing;
    const res = new this(parent, board);
    if (!this.knownBoardItems.has(parent)) {
      this.knownBoardItems.set(parent, new Map());
    }
    this.knownBoardItems.get(parent)!.set(board, res);
    return res;
  }

  private constructor(
    parent: Breadcrumbs,
    private readonly board: BoardOrHost
  ) {
    this.breadcrumbs = parent.pushed(board.toString());

    const treeItem = new vscode.TreeItem(
      board.toString(),
      vscode.TreeItemCollapsibleState.Collapsed
    );

    const isHost = board.isHost;
    const isDefault = config.board.get() === board.toString();

    treeItem.iconPath = isHost
      ? new vscode.ThemeIcon('device-desktop')
      : new vscode.ThemeIcon('circuit-board');

    if (isDefault) {
      treeItem.description = 'default';
    }

    treeItem.contextValue = isDefault
      ? ViewItemContext.BOARD_DEFAULT
      : isHost
      ? ViewItemContext.BOARD_HOST
      : ViewItemContext.BOARD;

    this.treeItem = treeItem;
  }

  async refreshChildren(ctx: Context): Promise<void | Error> {
    const packages = await listPackages(ctx, this.board);
    if (packages instanceof Error) return packages;

    const favoriteCategories = new Set(
      config.boardsAndPackages.favoriteCategories.get() ?? []
    );
    const favoritePackages = new Set(
      config.boardsAndPackages.favoritePackages.get() ?? []
    );

    const categoryToPackages = new Map<string, PackageWithPreference[]>();

    for (const pkg of packages) {
      if (!categoryToPackages.has(pkg.category)) {
        categoryToPackages.set(pkg.category, []);
      }
      const favorite = favoritePackages.has(getQualifiedPackageName(pkg));
      categoryToPackages.get(pkg.category)?.push({favorite, ...pkg});
    }

    const categories = [...categoryToPackages.keys()].map(category => ({
      category,
      favorite: favoriteCategories.has(category),
    }));

    categories.sort((a, b) => {
      if (a.favorite !== b.favorite) {
        return a.favorite ? -1 : 1;
      }
      return a.category.localeCompare(b.category);
    });

    this.children.splice(0);

    for (const {category, favorite} of categories) {
      const packages = categoryToPackages.get(category)!;

      packages.sort((a, b) => {
        if (a.favorite !== b.favorite) {
          return a.favorite ? -1 : 1;
        }
        const aStarted = a.workon === 'started';
        const bStarted = b.workon === 'started';
        if (aStarted !== bStarted) {
          return aStarted ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      this.children.push(
        new PackageCategoryItem(this.breadcrumbs, category, favorite, packages)
      );
    }
  }

  static clearCacheForTesting(): void {
    this.knownBoardItems.clear();
  }
}
