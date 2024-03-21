// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as path from 'path';
import {getDriver} from '../../shared/app/common/driver_repository';
import * as config from '../../shared/app/services/config';

const driver = getDriver();

// Expand the `PATH` environment variable to `<custom_setting>:$PATH:~/depot_tools`. This gives
// preference to the custom setting and a fallback on a default.
export async function envForDepotTools(): Promise<{PATH: string}> {
  const depotToolsConfig = config.paths.depotTools.get();
  const pathVar = await driver.getUserEnvPath();
  const originalPath = pathVar instanceof Error ? undefined : pathVar;
  const homeDepotTools = path.join(os.homedir(), 'depot_tools');

  const expandedPath: string[] = [];
  if (depotToolsConfig) {
    expandedPath.push(depotToolsConfig);
  }
  if (originalPath) {
    expandedPath.push(originalPath);
  }
  expandedPath.push(homeDepotTools);

  return {
    PATH: expandedPath.join(':'),
  };
}
