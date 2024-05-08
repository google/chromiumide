// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  BoardOrHost,
  Board,
  HOST,
} from '../../../../../shared/app/common/chromiumos/board_or_host';
import {getSetupBoardsAlphabetic} from '../../../../../shared/app/common/chromiumos/boards';
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
    const boards: BoardOrHost[] = (
      await getSetupBoardsAlphabetic(
        ctx.chrootService.chroot,
        ctx.chrootService.out
      )
    ).map(b => Board.newBoard(b));

    this.children.splice(0);

    for (const board of boards.concat([HOST])) {
      this.children.push(BoardItem.create(this.breadcrumbs, board));
    }
  }
}
