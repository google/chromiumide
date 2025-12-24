// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {getDriver} from './driver_repository';

export const driver = getDriver();

/**
 * Expands the `PATH` environment variable to `<custom_setting>:$PATH:~/depot_tools`. This gives
 * preference to the custom setting and a fallback on a default.
 */
export async function extraEnvForDepotTools(): Promise<{PATH: string}> {
  const depotToolsPath = await driver.cros.getDepotToolsPath();
  return {PATH: depotToolsPath};
}
