// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';

/**
 * Similar to fsPromises.stat, but it returns undefined on error, instead of
 * throwing it.
 */
export async function statNoThrow(file: string): Promise<fs.Stats | undefined> {
  try {
    return await fs.promises.stat(file);
  } catch (e) {
    return undefined;
  }
}
