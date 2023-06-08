// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';

export type ParsedPackageName = {
  // Package's category, e.g. chromeos-base
  category: string;
  // Package name, e.g. missive
  name: string;
};

export type EbuildPackage = ParsedPackageName & {
  // Package version (excluding revision, if any), e.g. 9999
  version: string;
  // Package revision (if any), e.g. r123
  revision?: string;
};

type EbuildDefinedVariables = Readonly<{
  p: string;
  pn: string;
  pv: string;
  pvr: string;
  pf: string;
  category: string;
  workdir: string;
  sysroot: string;
  s: string;
}>;

/**
 * The variables ebuild defines.
 * https://devmanual.gentoo.org/ebuild-writing/variables/index.html
 *
 * Implementation is based on portage/package/ebuild/doebuild.py.
 */
export function ebuildDefinedVariables(
  board: string | undefined,
  pkg: EbuildPackage
): EbuildDefinedVariables {
  const {portageTmpdir, sysroot} = portageDefinedVariables(board);

  const category = pkg.category;
  const pn = pkg.name;
  const pv = pkg.version;
  const pvr = pkg.revision ? `${pkg.version}-${pkg.revision}` : pkg.version;
  const pf = `${pn}-${pvr}`;
  const p = `${pn}-${pv}`;

  // NB: this is incorrect for "unmerge", "prerm", "postrm", "cleanrm" phase
  // functions, for which 'portage' should be omitted.
  const portageBuilddir = path.join(portageTmpdir, 'portage', category, pf);

  const workdir = path.join(portageBuilddir, 'work');

  return {
    p,
    pn,
    pv,
    pvr,
    pf,
    category,
    workdir,
    sysroot,
    s: `${workdir}/${p}`,
  } as const;
}

/** Variables defined in the ebuild environment by Portage. */
function portageDefinedVariables(board: string | undefined) {
  const sysroot = board ? path.join('/build', board) : '/';
  const portageTmpdir = path.join(sysroot, 'tmp');

  return {
    portageTmpdir,
    sysroot,
  } as const;
}
