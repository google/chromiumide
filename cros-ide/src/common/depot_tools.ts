// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as path from 'path';
import * as process from 'process';
import * as config from '../services/config';

// Expand the `PATH` environment variable to `<custom_setting>:$PATH:~/depot_tools`. This gives
// preference to the custom setting and a fallback on a default.
export function envForDepotTools(): Record<string, string> {
  const depotToolsConfig = config.paths.depotTools.get();
  const originalPath = process.env['PATH'];
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
    ...process.env,
    PATH: expandedPath.join(':'),
  };
}
