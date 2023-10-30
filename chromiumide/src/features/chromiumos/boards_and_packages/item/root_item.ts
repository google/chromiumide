// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {BoardOrHost} from '../../../../common/chromiumos/board_or_host';
import {getSetupBoardsAlphabetic} from '../../../../common/cros';
import {Context} from '../context';
import {BoardItem} from './board_item';
import {Breadcrumbs} from './breadcrumbs';
import {Item} from './item';

export class RootItem implements Item {
  readonly breadcrumbs = Breadcrumbs.EMPTY;

  readonly treeItem = new vscode.TreeItem('unused');

  readonly children: Item[] = [];

  constructor() {}

  async refreshChildren(ctx: Context): Promise<void> {
    const boards = (
      await getSetupBoardsAlphabetic(
        ctx.chrootService.chroot,
        ctx.chrootService.out
      )
    ).map(b => BoardOrHost.newBoard(b));

    this.children.splice(0);

    for (const board of boards.concat([BoardOrHost.HOST])) {
      this.children.push(BoardItem.create(this.breadcrumbs, board));
    }
  }
}
