// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  CheckerConfig,
  CheckerInput,
} from '../../../../../../features/device_management/commands/check_image/types';

export const CONFIG: CheckerConfig = {versionMaxSkew: 7};

export const HOSTNAME = 'hostname';
export const BOARD_NAME = 'foo';

/*
 * Return a CheckerInput that by default describes a stale release image the local package builds
 * with cros-debug set.
 */
export function getTestingInput(
  imageType: string,
  imageCrosMajor: number,
  localDebugFlag: boolean | undefined | Error,
  localCrosMajor: number | Error
): CheckerInput {
  return {
    targetPackage: {category: 'chromeos-base', name: 'bar'},
    device: {
      board: BOARD_NAME,
      builderPath: `${BOARD_NAME}-${imageType}/R1-${imageCrosMajor}.0.0`,
      imageType: imageType,
      chromeosMajorVersion: imageCrosMajor,
      chromeosReleaseVersion: `${imageCrosMajor}.0.0`,
    },
    local: {
      debugFlag: localDebugFlag,
      chromeosMajorVersion: localCrosMajor,
    },
  };
}
