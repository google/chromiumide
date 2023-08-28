// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {BoardOrHost} from '../board_or_host';
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
