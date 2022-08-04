// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as commonUtil from '../../common/common_util';

export async function isGoogler(): Promise<boolean> {
  let lsbRelease: string;
  try {
    lsbRelease = await fs.promises.readFile('/etc/lsb-release', {
      encoding: 'utf8',
      flag: 'r',
    });
  } catch {
    // If lsb-release cannot be read, fallback to checking whether user is on corp network.
    return new Promise((resolve, _reject) => {
      https
        .get('https://cit-cli-metrics.appspot.com/should-upload', res => {
          resolve(res.statusCode === 200);
        })
        .on('error', _error => {
          resolve(false);
        });
    });
  }

  if (lsbRelease.includes('GOOGLE_ID=Goobuntu')) {
    return true;
  }
  return false;
}

// Return path to CrOS checkout.
function getCrOSPath(path: string): string | undefined {
  const chroot = commonUtil.findChroot(path);
  if (!chroot) {
    return undefined;
  }
  return commonUtil.sourceDir(chroot);
}

// Return git repository name by looking for closest .git directory, undefined if none.
export function getGitRepoName(
  filePath: string,
  crosPath: string | undefined = getCrOSPath(filePath)
): string | undefined {
  if (!crosPath) {
    return undefined;
  }

  let gitDir = path.dirname(filePath);
  while (!fs.existsSync(path.join(gitDir, '.git'))) {
    const parent = path.dirname(gitDir);
    if (parent === gitDir) {
      return undefined;
    }
    gitDir = parent;
  }

  // Trim prefixes corresponding to path of CrOS checkout.
  const crOSPathRE = new RegExp(`${crosPath}/(.*)`);
  const match = crOSPathRE.exec(gitDir);
  if (match) {
    return match[1];
  }
  return undefined;
}
