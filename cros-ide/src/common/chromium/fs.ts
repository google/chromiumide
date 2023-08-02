// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';

// Matches the following line:
// "url": "https://chromium.googlesource.com/chromium/src.git",
const CHROMIUM_GCLIENT_RE =
  /"url"\s*:\s*"https:\/\/chromium\.googlesource\.com\/chromium\/src\.git"\s*,/m;

async function isChromiumRoot(dir: string): Promise<boolean> {
  // We don't use `gclient revinfo --filter=src`, because it's slow (takes 7
  // seconds).
  const dotGclient = path.join(dir, '.gclient');
  try {
    const content = await fs.promises.readFile(dotGclient, 'utf8');

    return CHROMIUM_GCLIENT_RE.test(content);
  } catch (_e) {
    return false;
  }
}

/**
 * Returns chromium root containing the file or the directory.
 */
export async function chromiumRoot(file: string): Promise<string | undefined> {
  while (file !== '/') {
    if (await isChromiumRoot(file)) {
      return file;
    }
    file = path.dirname(file);
  }
  return undefined;
}
