// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as glob from 'glob';
import {Source} from '../../../common/common_util';
import {PackageInfo} from './types';

export async function generate(source: Source): Promise<PackageInfo[]> {
  let packages: PackageInfo[] = [];
  for (const overlay of OVERLAYS) {
    packages = packages.concat(await generateSub(path.join(source, overlay)));
  }
  return packages;
}

// Overlay directories we search for ebuild files.
const OVERLAYS = [
  'src/third_party/chromiumos-overlay',
  'src/private-overlays/chromeos-partner-overlay',
];

async function generateSub(dir: string) {
  const packages: PackageInfo[] = [];
  for (const ebuild of await util.promisify(glob)(`${dir}/**/*-9999.ebuild`)) {
    const platformSubdir = extractPlatformSubdir(
      await fs.promises.readFile(ebuild, 'utf-8')
    );
    if (platformSubdir) {
      packages.push({
        sourceDir: path.join('src/platform2', platformSubdir),
        atom: toPackageName(ebuild),
      });
    }
  }
  return packages;
}

function toPackageName(ebuildPath: string): string {
  const dir = path.dirname(ebuildPath);
  const name = path.basename(dir);
  const category = path.basename(path.dirname(dir));
  return `${category}/${name}`;
}

/**
 * Parse ebuild and returns PLATFORM_SUBDIR value if any.
 */
function extractPlatformSubdir(content: string): string | undefined {
  let isPlatform = false;
  let platformSubdir = '';

  let command = '';
  for (const line of content.split('\n')) {
    if (line.endsWith('\\')) {
      command += line.substring(0, line.length - 1);
      continue;
    }
    command += line;
    command.trim();

    if (/^inherit .*\bplatform\b/.test(command)) {
      isPlatform = true;
    }
    const m = /^PLATFORM_SUBDIR="([^"]+)"/.exec(command);
    if (m) {
      platformSubdir = m[1];
    }
    if (isPlatform && platformSubdir) {
      return platformSubdir;
    }

    // Clear command for the next iteration.
    command = '';
  }
  return undefined;
}

export const TEST_ONLY = {
  extractPlatformSubdir,
};
