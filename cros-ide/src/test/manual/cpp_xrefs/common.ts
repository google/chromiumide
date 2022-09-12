// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as commonUtil from '../../../common/common_util';
import * as servicesChroot from '../../../services/chroot';
import * as cros from '../../../common/cros';
import * as packages from '../../../features/cpp_code_completion/packages';

let chrootServiceCache: servicesChroot.ChrootService | undefined = undefined;

export function chrootServiceInstance(): servicesChroot.ChrootService {
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
  const chroot = path.join(source, 'chroot') as commonUtil.Chroot;

  chrootServiceCache = new servicesChroot.ChrootService(
    new cros.WrapFs(chroot),
    new cros.WrapFs(source)
  );
  return chrootServiceCache;
}

let packagesCache: packages.Packages | undefined = undefined;

export function packagesInstance(): packages.Packages {
  if (packagesCache) {
    return packagesCache;
  }
  packagesCache = new packages.Packages(chrootServiceInstance(), true);
  return packagesCache;
}
