// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as commonUtil from '../../../common/common_util';
import * as services from '../../../services';

let chrootServiceCache: services.chromiumos.ChrootService | undefined =
  undefined;

export function chrootServiceInstance(): services.chromiumos.ChrootService {
  if (chrootServiceCache) {
    return chrootServiceCache;
  }
  const crosIde = process.cwd();
  if (!crosIde.endsWith('ide_tooling/cros-ide')) {
    throw new Error('run the command from cros-ide directory');
  }
  const source = path.dirname(
    path.dirname(path.dirname(crosIde))
  ) as commonUtil.Source;

  chrootServiceCache = services.chromiumos.ChrootService.maybeCreate(
    source,
    false
  )!;
  return chrootServiceCache;
}

let packagesCache: services.chromiumos.Packages | undefined = undefined;

export function packagesInstance(): services.chromiumos.Packages {
  if (packagesCache) {
    return packagesCache;
  }
  packagesCache = services.chromiumos.Packages.getOrCreate(
    chrootServiceInstance()
  );
  return packagesCache;
}
