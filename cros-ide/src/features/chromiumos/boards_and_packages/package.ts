// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {CrosClient} from '../../../common/chromiumos/cros';
import {ParsedPackageName} from '../../../common/chromiumos/portage/ebuild';
import {VIRTUAL_BOARDS_HOST} from './constant';
import {Context} from './context';

export type Package = ParsedPackageName;

/**
 * Reads the package infos available for the board. It runs a few cros
 * commands to compute the result.
 */
export async function listPackages(
  ctx: Context,
  board: string
): Promise<Package[] | Error> {
  const crosClient = new CrosClient(
    ctx.chrootService.chromiumosRoot,
    ctx.output
  );

  return await crosClient.listAllPackages(
    board === VIRTUAL_BOARDS_HOST ? 'amd64-host' : board
  );
}
