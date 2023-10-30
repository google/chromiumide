// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import {BoardOrHost} from '../board_or_host';
import {
  EbuildPackage,
  ParsedEbuildFilepath,
  ebuildDefinedVariables,
} from './ebuild';
import {parseEbuildOrThrow} from './parse';

export type Platform2Package = EbuildPackage & {
  // PLATFORM_SUBDIR the ebuild file defines.
  platformSubdir: string;
  // CROS_WORKON_DESTDIR
  crosWorkonDestdir: string | string[];
  // CROS_WORKON_OUTOFTREE_BUILD
  crosWorkonOutoftreeBuild?: string;
  // CROS_WORKON_LOCALNAME
  crosWorkonLocalname: string[];
};

/**
 * The working directory where platform.eclass would be on executing
 * platform2_test.py.
 */
export function platform2TestWorkingDirectory(
  board: BoardOrHost,
  pkg: Platform2Package
): string {
  if (pkg.version !== '9999') {
    throw new Error(
      `failed getting test working directory: version must be 9999, but was ${pkg.version}`
    );
  }

  const vars = ebuildDefinedVariables(board, pkg);

  let s = vars.s;

  // Emulates cros-workon_src_unpack.
  if (pkg.crosWorkonOutoftreeBuild !== '1') {
    // Don't modify S.
  } else {
    // Given CROS_WORKON_OUTOFTREE_BUILD is 1, the project_count computed in
    // array_vars_autocomplete must be 1. Emulates get_paths under the
    // assumption.

    // No ebuilds set CROS_WORKON_SRCROOT, so assume the initial value for
    // pathbase to be CHROOT_SOURCE_ROOT.
    let pathbase = '/mnt/host/source';
    if (vars.category === 'chromeos-base' || vars.category === 'brillo-base') {
      pathbase += '/src';
    } else {
      pathbase += '/src/third_party';
    }
    const path = `${pathbase}/${pkg.crosWorkonLocalname[0]}`;

    s = path;
  }

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

  const parsedEbuild = parseEbuildOrThrow(content);

  const platformSubdir = parsedEbuild.getString('PLATFORM_SUBDIR') ?? '';

  const crosWorkonDestdir: string[] = parsedEbuild.getAsStrings(
    'CROS_WORKON_DESTDIR'
  ) ?? [''];

  const crosWorkonOutoftreeBuild: string | undefined = parsedEbuild.getString(
    'CROS_WORKON_OUTOFTREE_BUILD'
  );

  const crosWorkonLocalname = parsedEbuild.getAsStrings(
    'CROS_WORKON_LOCALNAME'
  ) ?? [pkg.name];

  return {
    ...pkg,
    platformSubdir,
    crosWorkonDestdir,
    crosWorkonOutoftreeBuild,
    crosWorkonLocalname,
  };
}
