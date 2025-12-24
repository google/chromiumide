// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as config from '../../shared/app/services/config';

/**
 * Get the value of os.platform() or a faked value for manual or automated testing.
 */
export function getPlatform(): string {
  // try-catch to allow tests not to fake configs.
  try {
    const fakePlatform = config.chromiumideDevelopment.osPlatform.get();
    if (fakePlatform) {
      return fakePlatform;
    }
  } catch (_e) {
    // do nothing
  }

  return os.platform();
}
