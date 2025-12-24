// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {BoardOrHost} from '../../../../../shared/app/common/chromiumos/board_or_host';
import {getDriver} from '../../../../../shared/app/common/driver_repository';
import {
  ParsedPackageName,
  getQualifiedPackageName,
} from '../../../../common/chromiumos/portage/ebuild';
import {Context} from '../context';

const driver = getDriver();

/**
 * Opens the ebuild file used for building the package for the board.
 */
export async function openEbuild(
  ctx: Context,
  board: BoardOrHost,
  pkg: ParsedPackageName
): Promise<void> {
  const res = await ctx.chrootService.exec(
    board.suffixedExecutable('equery'),
    ['which', '-m', getQualifiedPackageName(pkg)],
    {
      logger: ctx.output,
      logStdout: true,
      sudoReason: 'to query ebuild path',
    }
  );
  if (res instanceof Error) {
    void vscode.window.showErrorMessage(res.message);
    return;
  }
  const relFileName = res.stdout.trim().substring('/mnt/host/source/'.length);
  const chromiumos = ctx.chrootService.chromiumos;
  const fileName = chromiumos.realpath(relFileName);
  const document = await vscode.workspace.openTextDocument(fileName);
  await vscode.window.showTextDocument(document);

  driver.metrics.send({
    category: 'interactive',
    group: 'boards_and_packages',
    name: 'boards_and_packages_open_ebuild',
    description: 'open ebuild',
  });
}
