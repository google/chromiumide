// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import {
  ParsedEbuildFilepath,
  EbuildPackage,
  ebuildDefinedVariables,
} from './ebuild';
import {EbuildValue, parseEbuildOrThrow} from './parse';

export type Platform2Package = EbuildPackage & {
  // PLATFORM_SUBDIR the ebuild file defines.
  platformSubdir: string;
  // CROS_WORKON_DESTDIR
  crosWorkonDestdir: string | string[];
  // CROS_WORKON_OUTOFTREE_BUILD
  crosWorkonOutoftreeBuild?: string;
};

/**
 * The working directory where platform.eclass would be on executing
 * platform2_test.py.
 */
export function platform2TestWorkingDirectory(
  board: string | undefined,
  pkg: Platform2Package
): string {
  let {s} = ebuildDefinedVariables(board, pkg);

  // Emulates platform_src_unpack
  if (
    asArray(pkg.crosWorkonDestdir).length > 1 ||
    pkg.crosWorkonOutoftreeBuild !== '1'
  ) {
    s += '/platform2';
  }
  s += '/' + pkg.platformSubdir;

  return s;
}

function asArray(x: string | string[]): string[] {
  return typeof x === 'string' ? [x] : x;
}

/**
 * Reads the ebuild file for platform2 package and parses it. Throws if the file
 * doesn't have expected content.
 */
export async function parsePlatform2EbuildOrThrow(
  ebuildFilepath: string
): Promise<Platform2Package> {
  const {pkg} = ParsedEbuildFilepath.parseOrThrow(ebuildFilepath);

  const content = await fs.promises.readFile(ebuildFilepath, 'utf8');

  const {assignments} = parseEbuildOrThrow(content);

  const mapping = new Map<string, EbuildValue>();
  for (const {name, value} of assignments) {
    mapping.set(name, value);
  }

  let platformSubdir = '';
  {
    const v = mapping.get('PLATFORM_SUBDIR');
    if (v?.kind === 'string') {
      platformSubdir = v.value;
    }
  }

  let crosWorkonDestdir: string | string[] = '';
  {
    const v = mapping.get('CROS_WORKON_DESTDIR');
    if (v?.kind === 'string') {
      crosWorkonDestdir = v.value;
    } else if (v?.kind === 'array') {
      crosWorkonDestdir = v.value;
    }
  }

  let crosWorkonOutoftreeBuild: string | undefined;
  {
    const v = mapping.get('CROS_WORKON_OUTOFTREE_BUILD');
    if (v?.kind === 'string') {
      crosWorkonOutoftreeBuild = v.value;
    }
  }

  return {
    ...pkg,
    platformSubdir,
    crosWorkonDestdir,
    crosWorkonOutoftreeBuild,
  };
}
