// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {ParsedPackageName} from '../../../../common/chromiumos/portage/ebuild';
import {DeviceAttributes} from '../../device_client';

export type CheckerConfig = {
  versionMaxSkew: number;
};

export type CheckerInput = {
  // Used for constructing the result description only.
  targetPackage: ParsedPackageName;
  device: DeviceAttributes | Error;
  local: {
    // Value of the cros-debug USE flag of the target package.
    // Undefined means the flag is neither set nor unset (not used by the package at all).
    debugFlag: boolean | undefined | Error;
    chromeosMajorVersion: number | Error;
  };
};

export type CheckerOutput = {
  passed: boolean;
  results: {
    debugFlag: CheckResult;
    version: CheckResult;
  };
};

export type CheckResult = {
  status: 'PASSED' | 'FAILED' | 'ERROR';
  // A user-facing description of the check result, including the input local and image attributes,
  // or error if any.
  description: string;
};
