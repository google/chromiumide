// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';

/**
 * Returns the realpath of the chromiumos directory containing this file.
 */
export function getChromiumosDirectory(): string {
  return fs.realpathSync(path.join(__dirname, '../../../../../../..'));
}
