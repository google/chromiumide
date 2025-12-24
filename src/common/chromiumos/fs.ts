// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';

// Matches the following lines:
// url = https://chromium.googlesource.com/chromiumos/manifest
// url = https://chrome-internal.googlesource.com/chromeos/manifest-internal
const CHROMIUMOS_REPO_CONFIG_RE =
  /^\s*url\s*=\s*(https:\/\/chrome-internal\.googlesource\.com\/chromeos\/manifest-internal|https:\/\/chromium\.googlesource\.com\/chromiumos\/manifest)(\.git)?\s*$/m;

async function hasStandardManifest(dir: string): Promise<boolean> {
  const repoConfig = path.join(dir, '.repo/manifests.git/config');
  try {
    const content = await fs.promises.readFile(repoConfig, 'utf8');

    return CHROMIUMOS_REPO_CONFIG_RE.test(content);
  } catch (_e) {
    return false;
  }
}

const WELL_KNOWN_FILES = ['.repo', 'chromite', 'src/platform2'];

function hasAllWellKnownFiles(dir: string): boolean {
  for (const p of WELL_KNOWN_FILES) {
    const file = path.join(dir, p);
    if (!fs.existsSync(file)) {
      return false;
    }
  }
  return true;
}

export async function isChromiumosRoot(dir: string): Promise<boolean> {
  if (await hasStandardManifest(dir)) {
    return true;
  }
  // The user might have an irregular manifest and the check above produce a
  // false negative (b:259163795). The check below could produce a false
  // positive if a non chromiumos repository happens to have all the well-known
  // files, but it should be better than a false negative.
  return hasAllWellKnownFiles(dir);
}

/**
 * Returns chromiumOS root containing the file or the directory.
 */
export async function chromiumosRoot(
  file: string
): Promise<string | undefined> {
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
