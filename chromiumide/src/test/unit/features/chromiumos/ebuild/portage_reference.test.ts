// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as portage_reference from '../../../../../features/chromiumos/ebuild/portage_reference';
import {
  FakeCancellationToken,
  FakeTextDocument,
} from '../../../../testing/fakes';

const {
  EBUILD_DEFINED_VARIABLES_HOVER_STRING,
  EBUILD_PHASE_FUNCTIONS_HOVER_STRING,
  PORTAGE_PREDEFINED_READ_ONLY_VARIABLES_HOVER_STRING,
} = portage_reference.TEST_ONLY;

const SIMPLE_EBUILD = `
EAPI=7
inherit multilib-minimal arc-build-constants

DESCRIPTION="Ebuild for per-sysroot arc-build components."

LICENSE="BSD-Google"
SLOT="0"
KEYWORDS="*"

RDEPEND=""
DEPEND=""

S=\${WORKDIR}

src_compile() {
\tarc-build-constants-configure
}

install_pc_file() {
\tprefix="\${ARC_PREFIX}/usr"
\tsed \
\t\t-e "s|@lib@|$(get_libdir)|g" \
\t\t-e "s|@prefix@|\${prefix}|g" \
\t\t"\${PC_SRC_DIR}"/"$1" > "$1" || die
\tdoins "$1"
}

`;

describe('Portage Reference Hover Provider', () => {
  it('show hover', async () => {
    const portageReferenceHoverProvider =
      new portage_reference.PortageReferenceHoverProvider();
    const textDocument = new FakeTextDocument({text: SIMPLE_EBUILD});

    let position = new vscode.Position(1, 1); // Of EAPI
    const hoverEapi = portageReferenceHoverProvider.provideHover(
      textDocument,
      position,
      new FakeCancellationToken()
    );
    expect(hoverEapi).toEqual(
      new vscode.Hover(
        EBUILD_DEFINED_VARIABLES_HOVER_STRING('EAPI'),
        new vscode.Range(1, 0, 1, 4)
      )
    );

    position = new vscode.Position(13, 8); // Of WORKDIR
    const hoverWorkdir = portageReferenceHoverProvider.provideHover(
      textDocument,
      position,
      new FakeCancellationToken()
    );
    expect(hoverWorkdir).toEqual(
      new vscode.Hover(
        PORTAGE_PREDEFINED_READ_ONLY_VARIABLES_HOVER_STRING('WORKDIR'),
        new vscode.Range(13, 4, 13, 11)
      )
    );
    position = new vscode.Position(15, 5); // Of src_compile
    const hoverSrcCompile = portageReferenceHoverProvider.provideHover(
      textDocument,
      position,
      new FakeCancellationToken()
    );
    expect(hoverSrcCompile).toEqual(
      new vscode.Hover(
        EBUILD_PHASE_FUNCTIONS_HOVER_STRING('src_compile'),
        new vscode.Range(15, 0, 15, 11)
      )
    );
  });
});
