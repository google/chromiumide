// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {EbuildPackage, ebuildDefinedVariables} from './ebuild';

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
