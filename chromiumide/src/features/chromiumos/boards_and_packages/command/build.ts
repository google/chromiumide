// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as vscode from 'vscode';
import {BoardOrHost} from '../../../../common/chromiumos/board_or_host';
import {
  ParsedPackageName,
  getQualifiedPackageName,
} from '../../../../common/chromiumos/portage/ebuild';
import {CancelledError} from '../../../../common/common_util';
import {Context} from '../context';

/**
 * Builds the given package for the board.
 */
export async function build(
  ctx: Context,
  board: BoardOrHost,
  pkg: ParsedPackageName
): Promise<void> {
  const qpn = getQualifiedPackageName(pkg);

  const nproc = os.cpus().length.toString();
  const args = [board.suffixedExecutable('emerge'), qpn, '--jobs', nproc];

  await vscode.window.withProgress(
    {
      title: `Building ${qpn} for ${board.toString()}`,
      location: vscode.ProgressLocation.Notification,
      cancellable: true,
    },
    async (_progress, token) => {
      ctx.output.show();

      const res = await ctx.chrootService.exec(args[0], args.slice(1), {
        sudoReason: 'to build package',
        logger: ctx.output,
        logStdout: true,
        cancellationToken: token,
      });

      if (res instanceof CancelledError) {
        void vscode.window.showInformationMessage('Build cancelled');
        return;
      } else if (res instanceof Error) {
        void (async () => {
          const choice = await vscode.window.showErrorMessage(
            `Build ${qpn}: ${res}`,
            'Show Log'
          );
          if (choice) {
            ctx.output.show();
          }
        })();
        return;
      }
      void vscode.window.showInformationMessage(
        `${qpn} has been built for ${board}`
      );
    }
  );
}
