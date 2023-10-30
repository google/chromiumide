// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as commonUtil from '../../../common/common_util';
import {WrapFs} from '../../../common/cros';
import {ChrootExecOptions, CrosFs} from '../../../services/chromiumos/chroot';

/**
 * Easy-to-create fake ChrootService implementation for testing/spying.
 */
export class FakeChrootService {
  get chroot(): WrapFs<commonUtil.Chroot> {
    return new WrapFs('chroot' as commonUtil.Chroot);
  }

  get source(): WrapFs<commonUtil.Source> {
    return new WrapFs('chroot/src' as commonUtil.Source);
  }

  get out(): WrapFs<commonUtil.CrosOut> {
    return new WrapFs('out' as commonUtil.CrosOut);
  }

  get crosFs(): CrosFs {
    return {
      chroot: this.chroot,
      source: this.source,
      out: this.out,
    };
  }

  async exec(
    _name: string,
    _args: string[],
    _options: ChrootExecOptions
  ): ReturnType<typeof commonUtil.exec> {
    return {
      exitStatus: 0.0,
      stdout: '',
      stderr: '',
    };
  }
}
