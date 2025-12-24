// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {BoardOrHost} from '../../../../shared/app/common/chromiumos/board_or_host';
import {AbnormalExitError} from '../../../../shared/app/common/exec/types';
import {chromiumos} from '../../../services';
import {ParsedPackageName} from './ebuild';

/**
 * Builds a command run in chroot to get the 9999 ebuild filepath.
 */
export function buildGet9999EbuildCommand(
  board: BoardOrHost,
  pkg: ParsedPackageName
): string[] {
  return [
    'env',
    // Accept 9999 ebuilds that have the ~* keyword.
    // https://wiki.gentoo.org/wiki/ACCEPT_KEYWORDS
    'ACCEPT_KEYWORDS=~*',
    board.suffixedExecutable('equery'),
    'which',
    `=${pkg.category}/${pkg.name}-9999`,
  ];
}

/*
 * Returns all use flags for installation on given board for given package, or error if the command
 * fails to execute.
 *
 * Note that we want use flags use flags used on building the binary package but not the setting for
 * (new) installation because `cros deploy` only copies the binary packages built and does not build
 * the package.
 */
export async function getUseFlagsInstalled(
  board: BoardOrHost,
  targetPackage: string,
  chrootService: chromiumos.ChrootService,
  reason?: `to ${string}`,
  output?: vscode.OutputChannel
): Promise<Map<string, boolean> | Error> {
  // `equery uses` is normally the command to get use flags. It provides two states, 'U - final flag
  // setting for installation' and (the second one) 'I - package is installed with flag'.
  // However, with ChrootService.exec, `equery uses` strips "noises" and gives a simple output that
  // contains only the 'U' flag but not the 'I' flag.
  // So we have to parse the more complicated output from `emerge` instead.
  const args = [
    board.suffixedExecutable('emerge'),
    '--pretend', // to not really rebuild the package
    '--verbose', // to show USE flags
    '--nodeps', // to avoid unnecessary dependency calculation
    '--usepkg', // to print the USE flags from the binary package with fallback, used also by `cros deploy` command
    targetPackage,
  ];
  const result = await chrootService.exec(args[0], args.slice(1), {
    sudoReason:
      reason ?? `to get ${targetPackage} use flags on ${board.toBoardName()}`,
    logger: output,
  });
  if (result instanceof Error) {
    if (result instanceof AbnormalExitError && result.exitStatus === 127) {
      return new Error(
        `Failed to get USE flags of ${targetPackage} on ${board}: command not found: have you setup board ${board} on chroot?`
      );
    }
    if (
      result instanceof AbnormalExitError &&
      result.exitStatus === 1 &&
      result.stderr.includes('emerge: there are no binary packages to satisfy ')
    ) {
      const suggestedPackageMsgRe = /emerge: Maybe you meant .*/;
      const suggestedPackageMsgMatch = result.stderr.match(
        suggestedPackageMsgRe
      );
      return new Error(
        `Failed to get USE flags of ${targetPackage} on ${board}: binary package not found: ${
          suggestedPackageMsgMatch
            ? suggestedPackageMsgMatch[0]
            : 'emerge: nothing similar found.'
        }`
      );
    }
    return result;
  }

  const flags = new Map<string, boolean>();

  // First get the list of all USE flags (a string of space-delimited flag settings).
  const useFlagsRe = /USE="([^"]*)"/;
  const match = useFlagsRe.exec(result.stdout);
  // Assume package does not have any USE flag, return empty map.
  if (!match) return flags;

  // Legal characters for use flag names: https://projects.gentoo.org/pms/8/pms.html#x1-200003.1.4
  // A '-' prefix means the flag is unset:
  //   https://dev.gentoo.org/~zmedico/portage/doc/man/emerge.1.html.
  const flagRe = /(-)?([A-Za-z0-9+_@-]+)(\*)?/;
  for (const flag of match[1].split(' ')) {
    const fmatch = flagRe.exec(flag);
    if (!fmatch) {
      return new Error(
        `Failed to parse USE flag "${flag}" for ${targetPackage} on ${board}: must match ${flagRe.source}`
      );
    }
    // Value of the installed flag is XOR of its new state and whether or not it is different from
    // the installed state.
    flags.set(fmatch[2], (fmatch[1] !== '-') !== (fmatch[3] === '*'));
  }
  return flags;
}
