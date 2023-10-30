// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ViewItemContext} from '../constant';
import {Context} from '../context';
import {Package} from '../package';
import {Breadcrumbs} from './breadcrumbs';
import {Item} from './item';

export type PackageWithPreference = Package & {favorite: boolean};

export class PackageNameItem implements Item {
  readonly breadcrumbs;
  readonly treeItem;
  readonly children: [] = [];

  constructor(parent: Breadcrumbs, pkg: PackageWithPreference) {
    this.breadcrumbs = parent.pushed(pkg.name);

    const treeItem = new vscode.TreeItem(pkg.name);

    treeItem.contextValue = pkg.favorite
      ? {
          none: ViewItemContext.PACKAGE_FAVORITE,
          started: ViewItemContext.PACKAGE_STARTED_FAVORITE,
          stopped: ViewItemContext.PACKAGE_STOPPED_FAVORITE,
        }[pkg.workon]
      : {
          none: ViewItemContext.PACKAGE,
          started: ViewItemContext.PACKAGE_STARTED,
          stopped: ViewItemContext.PACKAGE_STOPPED,
        }[pkg.workon];

    if (pkg.favorite) {
      if (pkg.workon === 'started') {
        treeItem.description = '★ (workon)';
      } else {
        treeItem.description = '★';
      }
    } else if (pkg.workon === 'started') {
      treeItem.description = '(workon)';
    }

    this.treeItem = treeItem;
  }

  async refreshChildren(_ctx: Context): Promise<void> {}
}
