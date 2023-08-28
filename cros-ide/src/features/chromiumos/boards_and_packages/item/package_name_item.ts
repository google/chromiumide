// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ViewItemContext} from '../constant';
import {Context} from '../context';
import {Package} from '../package';
import {Breadcrumbs} from './breadcrumbs';
import {Item} from './item';

export class PackageNameItem implements Item {
  readonly breadcrumbs;
  readonly treeItem;
  readonly children: [] = [];

  constructor(parent: Breadcrumbs, pkg: Package) {
    this.breadcrumbs = parent.pushed(pkg.name);

    const treeItem = new vscode.TreeItem(pkg.name);

    treeItem.contextValue = {
      none: ViewItemContext.PACKAGE,
      started: ViewItemContext.PACKAGE_STARTED,
      stopped: ViewItemContext.PACKAGE_STOPPED,
    }[pkg.workon];

    this.treeItem = treeItem;
  }

  async refreshChildren(_ctx: Context): Promise<void> {}
}
