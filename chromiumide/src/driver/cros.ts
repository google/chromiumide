// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as commonUtil from '../../shared/app/common/common_util';
import {getDriver} from '../../shared/app/common/driver_repository';
import {Cros} from '../../shared/driver/cros';

const driver = getDriver();

export class CrosImpl implements Cros {
  async findChroot(path?: string): Promise<string | undefined> {
    if (path === undefined) return undefined;
    for (;;) {
      const chroot = driver.path.join(path, 'chroot');
      if (await commonUtil.isChroot(chroot)) {
        return chroot;
      }

      const d = driver.path.dirname(path);
      if (d === path) {
        break;
      }
      path = d;
    }
    return undefined;
  }
  async findSourceDir(path?: string): Promise<string | undefined> {
    if (path === undefined) return undefined;
    const chroot = await this.findChroot(path);
    if (chroot === undefined) {
      return undefined;
    }
    return driver.path.dirname(chroot);
  }
}
