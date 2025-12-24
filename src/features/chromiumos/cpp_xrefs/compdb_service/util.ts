// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import {PackageInfo} from '../../../../services/chromiumos';

/**
 * Returns the destination on which the compilation database should be generated.
 */
export function destination(
  chromiumosRoot: string,
  {sourceDir}: PackageInfo
): string {
  return path.join(chromiumosRoot, sourceDir, 'compile_commands.json');
}
