// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as vscode from 'vscode';
import {Metrics} from '../../metrics/metrics';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      {language: 'shellscript', pattern: '**/*.{ebuild,eclass}'},
      new PortageReferenceHoverProvider()
    )
  );
}

const PORTAGE_PREDEFINED_READ_ONLY_VARIABLES_HOVER_STRING = (varName: string) =>
  `${varName} is a portage predefined read-only variable, see https://devmanual.gentoo.org/ebuild-writing/variables/#predefined-read-only-variables.` as const;
const EBUILD_DEFINED_VARIABLES_HOVER_STRING = (varName: string) =>
  `${varName} is a portage ebuild-defined variable, see https://devmanual.gentoo.org/ebuild-writing/variables/#ebuild-defined-variables.` as const;
const EBUILD_PHASE_FUNCTIONS_HOVER_STRING = (fnName: string) =>
  `${fnName} is a portage ebuild phase function, see https://devmanual.gentoo.org/ebuild-writing/functions/${fnName}/index.html.` as const;

const PORTAGE_PREDEFINED_READ_ONLY_VARAIBLES = [
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

const EBUILD_DEFINED_VARIABLES = [
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

const EBUILD_PHASE_FUNCTIONS = [
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

export class PortageReferenceHoverProvider implements vscode.HoverProvider {
  constructor() {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const range = document.getWordRangeAtPosition(position);
    const word = document.getText(range);
    if (PORTAGE_PREDEFINED_READ_ONLY_VARAIBLES.includes(word)) {
      Metrics.send({
        category: 'background',
        group: 'ebuild',
        name: 'show_portage_predefined_read_only_variable_hover',
        description:
          'ebuild: user hovered on portage predefined read-only variable',
        word: word,
      });
      return new vscode.Hover(
        PORTAGE_PREDEFINED_READ_ONLY_VARIABLES_HOVER_STRING(word),
        range
      );
    }
    if (EBUILD_DEFINED_VARIABLES.includes(word)) {
      Metrics.send({
        category: 'background',
        group: 'ebuild',
        name: 'show_ebuild_defined_variable_hover',
        description: 'ebuild: user hovered on ebuild-defined variable',
        word: word,
      });
      return new vscode.Hover(
        EBUILD_DEFINED_VARIABLES_HOVER_STRING(word),
        range
      );
    }
    if (EBUILD_PHASE_FUNCTIONS.includes(word)) {
      Metrics.send({
        category: 'background',
        group: 'ebuild',
        name: 'show_ebuild_phase_function_hover',
        description: 'ebuild: user hovered on an ebuild phase function',
        word: word,
      });
      return new vscode.Hover(EBUILD_PHASE_FUNCTIONS_HOVER_STRING(word), range);
    }
  }
}

export const TEST_ONLY = {
  PORTAGE_PREDEFINED_READ_ONLY_VARIABLES_HOVER_STRING,
  EBUILD_DEFINED_VARIABLES_HOVER_STRING,
  EBUILD_PHASE_FUNCTIONS_HOVER_STRING,
};
