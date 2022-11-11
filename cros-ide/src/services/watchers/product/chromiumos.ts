// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';

// Matches the following lines:
// url = https://chromium.googlesource.com/chromiumos/manifest
// url = https://chrome-internal.googlesource.com/chromeos/manifest-internal
const CHROMIUMOS_REPO_CONFIG_RE =
  /^\s*url\s*=\s*(https:\/\/chrome-internal\.googlesource\.com\/chromeos\/manifest-internal|https:\/\/chromium\.googlesource\.com\/chromiumos\/manifest)(\.git)?\s*$/m;

async function isChromiumosRoot(dir: string): Promise<boolean> {
  const repoConfig = path.join(dir, '.repo/manifests.git/config');
  try {
    const content = await fs.promises.readFile(repoConfig, 'utf8');

    return CHROMIUMOS_REPO_CONFIG_RE.test(content);
  } catch (_e) {
    return false;
  }
}

/**
 * Returns chromiumOS root containing the file or the directory.
 */
export async function root(file: string): Promise<string | undefined> {
  // We don't use `repo --show-toplevel` here to make it easy to create
  // fake repos in unit tests.
  while (file !== '/') {
    if (await isChromiumosRoot(file)) {
      return file;
    }
    file = path.dirname(file);
  }
  return undefined;
}
