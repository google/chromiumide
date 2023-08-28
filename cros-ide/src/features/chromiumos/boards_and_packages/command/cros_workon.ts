// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  ParsedPackageName,
  getQualifiedPackageName,
} from '../../../../common/chromiumos/portage/ebuild';
import {underDevelopment} from '../../../../services/config';
import {Metrics} from '../../../metrics/metrics';
import {VIRTUAL_BOARDS_HOST} from '../constant';
import {Context} from '../context';

export async function crosWorkon(
  ctx: Context,
  board: string,
  pkg: string | ParsedPackageName,
  action: 'start' | 'stop'
): Promise<void> {
  const targetName =
    typeof pkg === 'string' ? pkg : getQualifiedPackageName(pkg);

  if (underDevelopment.boardsAndPackagesV2.get()) {
    if (action === 'start') {
      Metrics.send({
        category: 'interactive',
        group: 'boards_and_packages',
        description: 'cros_workon start',
        name: 'boards_and_packages_cros_workon_start',
        package: targetName,
        board,
      });
    } else {
      Metrics.send({
        category: 'interactive',
        group: 'boards_and_packages',
        description: 'cros_workon stop',
        name: 'boards_and_packages_cros_workon_stop',
        package: targetName,
        board,
      });
    }
  } else {
    if (action === 'start') {
      Metrics.send({
        category: 'interactive',
        group: 'package',
        description: 'cros_workon start',
        name: 'package_cros_workon_start',
        package: targetName,
        board,
      });
    } else {
      Metrics.send({
        category: 'interactive',
        group: 'package',
        description: 'cros_workon stop',
        name: 'package_cros_workon_stop',
        package: targetName,
        board,
      });
    }
  }

  const res = await ctx.chrootService.exec(
    'cros_workon',
    [
      board === VIRTUAL_BOARDS_HOST ? '--host' : `--board=${board}`,
      action,
      targetName,
    ],
    {
      logger: ctx.output,
      logStdout: true,
      ignoreNonZeroExit: true,
      sudoReason: 'to run cros_workon in chroot',
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
