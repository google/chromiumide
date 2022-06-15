// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as commonUtil from '../../../common/common_util';
import * as testing from '..';

/**
 * Installs a FakeExec handler that responds to sudo calls.
 *
 * This function must be called in describe.
 */
export function installFakeSudo(fakeExec: testing.FakeExec): void {
  beforeEach(() => {
    fakeExec.on(
      'sudo',
      testing.prefixMatch(['--askpass', '--'], (restArgs, options) => {
        return commonUtil.exec(restArgs[0], restArgs.slice(1), options);
      })
    );
  });
}
