// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as vscode from 'vscode';
import {parseEbuildOrThrow} from '../../../../../server/ebuild_lsp/shared/parse';
import {BoardOrHost} from '../../../../../shared/app/common/chromiumos/board_or_host';
import {CancelledError} from '../../../../../shared/app/common/exec/types';
import {
  QuickPickItemWithPrefillButton,
  showInputBoxWithSuggestions,
} from '../../../../../shared/app/ui/input_box';
import {
  ParsedPackageName,
  getQualifiedPackageName,
} from '../../../../common/chromiumos/portage/ebuild';
import {Context} from '../context';

/**
 * Builds the given package for the board.
 */
export async function build(
  ctx: Context,
  board: BoardOrHost,
  pkg: ParsedPackageName,
  flags?: Record<string, string>
): Promise<void> {
  const args: string[] = [];

  if (flags) {
    args.push('env');
    for (const [key, value] of Object.entries(flags)) {
      args.push(`${key}=${value}`);
    }
  }

  const qpn = getQualifiedPackageName(pkg);
  const nproc = os.cpus().length.toString();
  args.push(board.suffixedExecutable('emerge'), qpn, '--jobs', nproc);

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

export async function buildWithFlags(
  ctx: Context,
  board: BoardOrHost,
  pkg: ParsedPackageName
): Promise<void> {
  let initialValue: string | undefined = undefined;
  for (;;) {
    const presets = [
      new QuickPickItemWithPrefillButton(
        'FEATURES="nostrip"',
        undefined,
        'Keep debug symbols'
      ),
    ];
    const flagString = await showInputBoxWithSuggestions(presets, {
      title: 'Build with flags',
      placeholder: 'Enter flags to pass to emerge',
      value: initialValue,
    });
    if (flagString === undefined) return;

    const flags = parseFlags(flagString.trim() + '\n');
    if (flags instanceof Error) {
      void vscode.window.showErrorMessage(flags.message);
      initialValue = flagString;
      // Allow the user to fix the string and try again.
      continue;
    }

    await build(ctx, board, pkg, flags);
    break;
  }
}

/**
 * Parse flags. For example, `A="a a" B=b C=` -> {A: "a a", B: "b", C: ""}
 */
function parseFlags(flags: string): Record<string, string> | Error {
  // Utilize the existing parser for ebuild. It works because ebuild is bash based.
  const document = {
    getText: () => flags,
    // We don't use the ranges, so no need to care about newlines.
    positionAt: (offset: number) => new vscode.Position(0, offset),
  };
  let asEbuild;
  try {
    asEbuild = parseEbuildOrThrow(document, 'Parsing flags failed: ');
  } catch (e) {
    return e as Error;
  }
  const res: Record<string, string> = {};
  for (const {name, value} of asEbuild.assignments) {
    const flagName = name.name;
    if (value.kind !== 'string') {
      return new Error(`Flag ${flagName} must be a string`);
    }
    res[flagName] = value.value;
  }
  return res;
}
