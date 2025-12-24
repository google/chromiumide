// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export type InitializationOptions = {
  chromiumosRoot: string;
  remoteName: string | undefined;
};

export const PORTAGE_PREDEFINED_READ_ONLY_VARIABLES_HOVER_STRING = (
  varName: string
) =>
  `${varName} is a portage predefined read-only variable, see https://devmanual.gentoo.org/ebuild-writing/variables/#predefined-read-only-variables.` as const;
export const EBUILD_DEFINED_VARIABLES_HOVER_STRING = (varName: string) =>
  `${varName} is a portage ebuild-defined variable, see https://devmanual.gentoo.org/ebuild-writing/variables/#ebuild-defined-variables.` as const;
export const EBUILD_PHASE_FUNCTIONS_HOVER_STRING = (fnName: string) =>
  `${fnName} is a portage ebuild phase function, see https://devmanual.gentoo.org/ebuild-writing/functions/${fnName}/index.html.` as const;

export const PORTAGE_PREDEFINED_READ_ONLY_VARAIBLES = [
  'P',
  'PN',
  'PV',
  'PR',
  'PVR',
  'PF',
  'A',
  'CATEGORY',
  'FILESDIR',
  'WORKDIR',
  'T',
  'D',
  'HOME',
  'ROOT',
  'DISTDIR',
  'EPREFIX',
  'ED',
  'EROOT',
  'SYSROOT',
  'ESYSROOT',
  'BROOT',
  'MERGE_TYPE',
  'REPLACING_VERSIONS',
  'REPLACED_BY_VERSION',
];

export const EBUILD_DEFINED_VARIABLES = [
  'EAPI',
  'DESCRIPTION',
  'HOMEPAGE',
  'SRC_URI',
  'LICENSE',
  'SLOT',
  'KEYWORDS',
  'IUSE',
  'REQUIRED_USE',
  'PROPERTIES',
  'RESTRICT',
  'DEPEND',
  'BDEPEND',
  'RDEPEND',
  'PDEPEND',
  'S',
  'DOCS',
  'HTML_DOCS',
];

export const EBUILD_PHASE_FUNCTIONS = [
  'pkg_pretend',
  'pkg_nofetch',
  'pkg_setup',
  'src_unpack',
  'src_prepare',
  'src_configure',
  'src_compile',
  'src_test',
  'src_install',
  'pkg_preinst',
  'pkg_postinst',
  'pkg_prerm',
  'pkg_postrm',
  'pkg_config',
  'pkg_info',
];
