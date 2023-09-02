// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import glob = require('glob');
import {ParsedPackageName} from '../../../common/chromiumos/portage/ebuild';
import {Source} from '../../../common/common_util';
import {PackageInfo} from './types';

/**
 * The class to generate the mapping between source code locations and package
 * names.
 */
export class Mapping {
  static async generate(source: Source): Promise<PackageInfo[]> {
    let packages: PackageInfo[] = [];
    for (const overlay of OVERLAYS) {
      packages = packages.concat(await generateSub(path.join(source, overlay)));
    }
    return packages;
  }
}

// Overlay directories we search for ebuild files.
const OVERLAYS = [
  'src/third_party/chromiumos-overlay',
  'src/private-overlays/chromeos-partner-overlay',
];

// HACK: Support nonstandard directory structures, where C++ files in a
// directory should be compiled by the target in a sibling directory.
const SIBLING_DEPS: Record<string, string[]> = {
  'camera/common': [
    // Instruct files under camera/features to be compiled with the same ebuild
    // file that compiles camera/common.
    'camera/features',
    'camera/gpu',
  ],
  'camera/tools/cros_camera_tool': ['camera/tools'],
  'camera/hal_adapter': ['camera/mojo'],
  // Corner case: for compiling common-mk/testrunner.cc, we can compile any
  // package that depends on //common-mk/testrunner:testrunner. We just choose
  // an alphabetically first package here.
  'arc/adbd': ['common-mk'],
};

async function generateSub(dir: string) {
  const packages: PackageInfo[] = [];
  for (const ebuild of await util.promisify(glob)(`${dir}/**/*-9999.ebuild`)) {
    const platformSubdir = extractPlatformSubdir(
      await fs.promises.readFile(ebuild, 'utf-8')
    );
    if (platformSubdir) {
      const pkg = toPackageName(ebuild);

      const subdirs = [platformSubdir];
      const sublings = SIBLING_DEPS[platformSubdir];
      if (sublings) {
        subdirs.push(...sublings);
      }

      for (const subdir of subdirs) {
        packages.push({
          sourceDir: path.join('src/platform2', subdir),
          pkg,
        });
      }
    }
  }
  return packages;
}

function toPackageName(ebuildPath: string): ParsedPackageName {
  const dir = path.dirname(ebuildPath);
  const name = path.basename(dir);
  const category = path.basename(path.dirname(dir));
  return {category, name};
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
