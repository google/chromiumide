// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {BoardOrHost} from '../../../common/chromiumos/board_or_host';
import {CrosClient} from '../../../common/chromiumos/cros_client';
import {
  ParsedPackageName,
  getQualifiedPackageName,
} from '../../../common/chromiumos/portage/ebuild';
import {Context} from './context';

export type Package = ParsedPackageName & {
  workon: 'none' | 'started' | 'stopped';
};

/**
 * Reads the package infos available for the board. It runs a few cros
 * commands to compute the result.
 */
export async function listPackages(
  ctx: Context,
  board: BoardOrHost
): Promise<Package[] | Error> {
  const crosClient = new CrosClient(
    ctx.chrootService.chromiumosRoot,
    ctx.output
  );

  const allPackages = await crosClient.listAllPackages(board);
  if (allPackages instanceof Error) return allPackages;

  const workonPackages = await crosClient.listWorkonPackages(board, {
    all: true,
  });
  if (workonPackages instanceof Error) return workonPackages;

  const workonStartedPackages = await crosClient.listWorkonPackages(board);
  if (workonStartedPackages instanceof Error) return workonStartedPackages;

  const workonPackagesSet = new Set(
    workonPackages.map(getQualifiedPackageName)
  );
  const workonStartedPackagesSet = new Set(
    workonStartedPackages.map(getQualifiedPackageName)
  );

  return allPackages.map(pkg => {
    const qpn = getQualifiedPackageName(pkg);
    const workon = workonStartedPackagesSet.has(qpn)
      ? 'started'
      : workonPackagesSet.has(qpn)
      ? 'stopped'
      : 'none';

    return {
      ...pkg,
      workon,
    };
  });
}
