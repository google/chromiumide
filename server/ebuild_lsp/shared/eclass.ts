// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';

const ECLASS_OVERLAY_DIRECTORIES = [
  'src/third_party/chromiumos-overlay/eclass/',
  'src/third_party/eclass-overlay/eclass/',
  'src/third_party/portage-stable/eclass/',
];

export function findEclassFilePath(
  eclass: string,
  chromiumosRoot: string
): string | undefined {
  for (const dir of ECLASS_OVERLAY_DIRECTORIES) {
    const filepath = path.join(chromiumosRoot, dir, `${eclass}.eclass`);
    if (fs.existsSync(filepath)) {
      return filepath;
    }
  }
  return undefined;
}
