// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as commonUtil from '../../../common/common_util';
import {arrayWithPrefixAnd} from '../../unit/testing/jasmine/asymmetric_matcher';
import {FakeExec} from '../fake_exec';

/**
 * Installs a fake handler for the command invoked inside chroot.
 *
 * callback takes the arguments that are given to the command with the given name in chroot.
 */
export function installChrootCommandHandler(
  fakeExec: FakeExec,
  source: commonUtil.Source,
  name: string,
  argsMatcher: jasmine.AsymmetricMatcher<string[]> | string[],
  callback: (
    args: string[],
    options?: commonUtil.ExecOptions
  ) => Promise<Awaited<ReturnType<typeof commonUtil.exec>> | string> | string,
  chrootOption?: {crosSdkWorkingDir?: string}
): void {
  const crosSdk = path.join(source, 'chromite/bin/cros_sdk');

  const crosSdkPrefix = [crosSdk];
  if (chrootOption?.crosSdkWorkingDir) {
    crosSdkPrefix.push('--working-dir', chrootOption.crosSdkWorkingDir);
  }
  crosSdkPrefix.push('--', name);

  const sudoCrosSdkPrefix = ['sudo', '--askpass', '--', ...crosSdkPrefix];

  for (const prefix of [crosSdkPrefix, sudoCrosSdkPrefix]) {
    fakeExec.installCallback(
      prefix[0],
      arrayWithPrefixAnd(prefix.slice(1), argsMatcher),
      (_name, args, options) =>
        callback(args.slice(prefix.slice(1).length), options)
    );
  }
}
