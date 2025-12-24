// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as config from '../../../../shared/app/services/config';

/** Sets the default device. */
export async function setDefaultDevice(hostname: string): Promise<void> {
  await config.deviceManagement.default.update(hostname);
}

/** Unsets the default device. */
export async function unsetDefaultDevice(): Promise<void> {
  await config.deviceManagement.default.update('');
}
