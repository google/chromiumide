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

export async function crosWorkon(
  ctx: Context,
  board: BoardOrHost,
  pkg: string | ParsedPackageName,
  action: 'start' | 'stop'
): Promise<void> {
  const targetName =
    typeof pkg === 'string' ? pkg : getQualifiedPackageName(pkg);

  if (action === 'start') {
    driver.metrics.send({
      category: 'interactive',
      group: 'boards_and_packages',
      description: 'cros_workon start',
      name: 'boards_and_packages_cros_workon_start',
      package: targetName,
      board: board.toString(),
    });
  } else {
    driver.metrics.send({
      category: 'interactive',
      group: 'boards_and_packages',
      description: 'cros_workon stop',
      name: 'boards_and_packages_cros_workon_stop',
      package: targetName,
      board: board.toString(),
    });
  }

  const res = await ctx.chrootService.exec(
    'cros',
    ['workon', board.map(b => `--board=${b}`, '--host'), action, targetName],
    {
      logger: ctx.output,
      logStdout: true,
      ignoreNonZeroExit: true,
      sudoReason: 'to run `cros workon` in chroot',
    }
  );
  if (res instanceof Error) {
    void vscode.window.showErrorMessage(res.message);
    return;
  }
  const {exitStatus, stderr} = res;
  if (exitStatus !== 0) {
    void vscode.window.showErrorMessage(`cros_workon failed: ${stderr}`);
  }
}
