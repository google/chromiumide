// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import {BoardOrHost} from '../board_or_host';

export type ParsedPackageName = {
  // Package's category, e.g. chromeos-base
  readonly category: string;
  // Package name, e.g. missive
  readonly name: string;
};

/**
 * Parse a qualified package name. The term qualified package name is used where a category/package
 * pair is meant: https://wiki.gentoo.org/wiki/Package_Manager_Specification
 */
export function parseQualifiedPackageName(
  qualifiedPackageName: string
): ParsedPackageName {
  const [category, name] = qualifiedPackageName.split('/');
  return {category, name};
}

/**
 * Stringify the parsed package name.
 */
export function getQualifiedPackageName({
  category,
  name,
}: ParsedPackageName): string {
  return `${category}/${name}`;
}

export type EbuildPackage = ParsedPackageName & {
  // Package version (excluding revision, if any), e.g. 9999
  readonly version: string;
  // Package revision (if any), e.g. r123
  readonly revision?: string;
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
  board: BoardOrHost,
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
function portageDefinedVariables(board: BoardOrHost) {
  const sysroot = board.sysroot();
  const portageTmpdir = path.join(sysroot, 'tmp');

  return {
    portageTmpdir,
    sysroot,
  } as const;
}

/**
 * Represents a parsed ebuild filepath.
 */
export class ParsedEbuildFilepath {
  /** Parses the ebuild filepath. It throws on parse failure. */
  static parseOrThrow(filepath: string): ParsedEbuildFilepath {
    const sections = filepath.split('/');

    const filename = sections.pop();
    const name = sections.pop();
    const category = sections.pop();

    if (!filename || !name || !category) {
      throw new Error(
        `Invalid ebuild filepath ${filepath}: category not found`
      );
    }

    const prefix = sections.join('/');

    const b = this.parseFilenameOrThrow(filename);
    if (name !== b.name) {
      throw new Error(
        `Invalid ebuild filepath ${filepath}: package name in directory (${name}) and filename (${b.name}) mismatch`
      );
    }

    return new ParsedEbuildFilepath(prefix, {
      category,
      name,
      version: b.version,
      revision: b.revision,
    });
  }

  /**
   * Parses ebuild filename.
   *
   * Reference: https://devmanual.gentoo.org/ebuild-writing/file-format/index.html
   */
  private static parseFilenameOrThrow(filename: string) {
    const regex = /^(.+?)-([^-]+)(?:-(r\d+))?\.ebuild$/;

    const m = regex.exec(filename);
    if (!m) {
      throw new Error(`Invalid ebuild filename: ${filename}`);
    }
    const name = m[1];
    const version = m[2];
    const revision = m[3] ?? undefined;

    return {name, version, revision};
  }

  /**
   * @param prefix The prefix part, e.g. /path/to/chromiumos-overlay for
   * /path/to/chromiumos-overlay/chromeos-base/codelab/codelab-0.0.1-r360.ebuild .
   */
  constructor(readonly prefix: string, readonly pkg: EbuildPackage) {}

  toString(): string {
    const pkg = this.pkg;

    let filename = `${pkg.name}-${pkg.version}`;
    if (pkg.revision) {
      filename += `-${pkg.revision}`;
    }
    filename += '.ebuild';

    return path.join(this.prefix, pkg.category, pkg.name, filename);
  }
}
