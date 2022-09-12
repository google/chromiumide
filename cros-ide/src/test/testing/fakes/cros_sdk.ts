// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as testing from '../../testing';
import * as commonUtil from '../../../common/common_util';

/**
 * Installs a fake handler for the command invoked inside chroot.
 */
export function installChrootCommandHandler(
  fakeExec: testing.FakeExec,
  source: commonUtil.Source,
  name: string,
  handler: testing.Handler
) {
  const crosSdk = path.join(source, 'chromite/bin/cros_sdk');

  fakeExec.on(
    crosSdk,
    testing.prefixMatch(['--', name], (restArgs, options) => {
      return handler(restArgs, options);
    })
  );
  fakeExec.on(
    'sudo',
    testing.prefixMatch(
      ['--askpass', '--', crosSdk, '--', name],
      (restArgs, options) => {
        return handler(restArgs, options);
      }
    )
  );
}
