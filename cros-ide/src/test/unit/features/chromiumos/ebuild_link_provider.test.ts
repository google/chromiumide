// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import dedent from 'dedent';
import {EbuildLinkProvider} from '../../../../features/chromiumos/ebuild_link_provider';
import {FakeCancellationToken, FakeTextDocument} from '../../../testing/fakes';

const csBase =
  'http://source.corp.google.com/h/chromium/chromiumos/codesearch/+/main:';

function documentLink(
  range: vscode.Range,
  target: vscode.Uri,
  tooltip: string
): vscode.DocumentLink {
  const link = new vscode.DocumentLink(range, target);
  link.tooltip = tooltip;
  return link;
}

function openFolderCmdUri(path: string): vscode.Uri {
  return vscode.Uri.parse(
    `command:vscode.openFolder?${encodeURIComponent(
      JSON.stringify([
        vscode.Uri.file(path),
        {
          forceNewWindow: true,
        },
      ])
    )}`
  );
}

/**
 * Return the pair of external codesearch link and vscode document link for given range and file path.
 */
function links(range: vscode.Range, path: string): vscode.DocumentLink[] {
  return [
    documentLink(
      range,
      vscode.Uri.parse(csBase + path),
      `Open ${path} in CodeSearch`
    ),
    documentLink(
      range,
      openFolderCmdUri(`/path/to/cros/${path}`),
      `Open ${path} in New VS Code Window`
    ),
  ];
}

describe('Ebuild Link Provider', () => {
  it('extracts links from string-type value', async () => {
    const CONTENT = dedent`# copyright
        EAPI=7
        CROS_WORKON_USE_VCSID="1"
        CROS_WORKON_LOCALNAME="platform2"
        CROS_WORKON_PROJECT="chromiumos/platform2"
        CROS_WORKON_OUTOFTREE_BUILD=1
        CROS_WORKON_SUBTREE="common-mk biod .gn"
        PLATFORM_SUBDIR="biod"
        `;

    const ebuildLinkProvider = new EbuildLinkProvider('/path/to/cros');
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_PLATFORM2 = new vscode.Range(3, 23, 3, 32);
    const RANGE_COMMONMK = new vscode.Range(6, 21, 6, 30);
    const RANGE_BIOD = new vscode.Range(6, 31, 6, 35);
    const RANGE_GN = new vscode.Range(6, 36, 6, 39);

    const PLATFORM2 = 'src/platform2';
    const COMMONMK = PLATFORM2 + '/common-mk';
    const BIOD = PLATFORM2 + '/biod';
    const GN = PLATFORM2 + '/.gn';

    expect(documentLinks).toEqual(
      [
        links(RANGE_PLATFORM2, PLATFORM2),
        links(RANGE_COMMONMK, COMMONMK),
        links(RANGE_BIOD, BIOD),
        links(RANGE_GN, GN),
      ].flat()
    );
  });

  it('extracts links from one-line array-type value', async () => {
    const CONTENT = dedent`# copyright
        EAPI=7
        CROS_WORKON_PROJECT=("chromiumos/platform2" "chromiumos/platform/vpd")
        CROS_WORKON_LOCALNAME=("platform2" "platform/vpd")
        CROS_WORKON_DESTDIR=("\${S}/platform2" "\${S}/platform2/vpd")
        CROS_WORKON_SUBTREE=("common-mk .gn" "")

        PLATFORM_SUBDIR="vpd"
        `;
    const ebuildLinkProvider = new EbuildLinkProvider('/path/to/cros');
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_PLATFORM2 = new vscode.Range(3, 24, 3, 33);
    const RANGE_VPD = new vscode.Range(3, 36, 3, 48);
    const RANGE_COMMONMK = new vscode.Range(5, 22, 5, 31);
    const RANGE_GN = new vscode.Range(5, 32, 5, 35);

    const PLATFORM2 = 'src/platform2';
    const VPD = 'src/platform/vpd';
    const COMMONMK = PLATFORM2 + '/common-mk';
    const GN = PLATFORM2 + '/.gn';

    expect(documentLinks).toEqual(
      [
        links(RANGE_PLATFORM2, PLATFORM2),
        links(RANGE_VPD, VPD),
        links(RANGE_COMMONMK, COMMONMK),
        links(RANGE_GN, GN),
      ].flat()
    );
  });

  it('extracts links from multiple-line array-type value', async () => {
    const CONTENT = `# copyright
EAPI=7

CROS_WORKON_LOCALNAME=(
\t"platform2"
\t"aosp/system/keymint"
\t"aosp/system/core/libcutils"
)

inherit cros-constants

CROS_WORKON_INCREMENTAL_BUILD="1"

CROS_WORKON_DESTDIR=(
\t"\${S}/platform2"
\t"\${S}/aosp/system/keymint"
\t"\${S}/aosp/system/core/libcutils"
)

CROS_WORKON_SUBTREE=(
\t"common-mk featured arc/keymint .gn"
\t""
\t""
)
PLATFORM_SUBDIR="arc/keymint"
    `;

    const ebuildLinkProvider = new EbuildLinkProvider('/path/to/cros');
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_PLATFORM2 = new vscode.Range(4, 3, 4, 12);
    const RANGE_SYSTEM_KEYMINT = new vscode.Range(5, 3, 5, 22);
    const RANGE_LIBCUTILS = new vscode.Range(6, 3, 6, 29);
    const RANGE_COMMONMK = new vscode.Range(20, 3, 20, 12);
    const RANGE_FEATURED = new vscode.Range(20, 13, 20, 21);
    const RANGE_ARC_KEYMINT = new vscode.Range(20, 22, 20, 33);
    const RANGE_GN = new vscode.Range(20, 34, 20, 37);

    const PLATFORM2 = 'src/platform2';
    const SYSTEM_KEYMINT = 'src/aosp/system/keymint';
    const LIBCUTILS = 'src/aosp/system/core/libcutils';
    const COMMONMK = PLATFORM2 + '/common-mk';
    const FEATURED = PLATFORM2 + '/featured';
    const ARC_KEYMINT = PLATFORM2 + '/arc/keymint';
    const GN = PLATFORM2 + '/.gn';

    expect(documentLinks).toEqual(
      [
        links(RANGE_PLATFORM2, PLATFORM2),
        links(RANGE_SYSTEM_KEYMINT, SYSTEM_KEYMINT),
        links(RANGE_LIBCUTILS, LIBCUTILS),
        links(RANGE_COMMONMK, COMMONMK),
        links(RANGE_FEATURED, FEATURED),
        links(RANGE_ARC_KEYMINT, ARC_KEYMINT),
        links(RANGE_GN, GN),
      ].flat()
    );
  });

  it('handles local name with leading two dots', async () => {
    const CONTENT = dedent`# copyright
        EAPI="7"
        CROS_WORKON_PROJECT="chromiumos/platform/tpm"
        CROS_WORKON_LOCALNAME="../third_party/tpm"

        inherit cros-sanitizers cros-workon toolchain-funcs
        `;

    const ebuildLinkProvider = new EbuildLinkProvider('/path/to/cros');
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_TPM = new vscode.Range(3, 23, 3, 41);
    const TPM = 'src/third_party/tpm';

    expect(documentLinks).toEqual([links(RANGE_TPM, TPM)].flat());
  });

  it('does not generate subtree links when length does not match localname', async () => {
    const CONTENT = `# copyright
EAPI=7

CROS_WORKON_LOCALNAME=(
\t"platform2"
\t"aosp/system/keymint"
)

CROS_WORKON_SUBTREE=(
\t"common-mk featured arc/keymint .gn"
)
PLATFORM_SUBDIR="arc/keymint"
        `;

    const ebuildLinkProvider = new EbuildLinkProvider('/path/to/cros');
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_PLATFORM2 = new vscode.Range(4, 3, 4, 12);
    const RANGE_SYSTEM_KEYMINT = new vscode.Range(5, 3, 5, 22);

    const PLATFORM2 = 'src/platform2';
    const SYSTEM_KEYMINT = 'src/aosp/system/keymint';

    expect(documentLinks).toEqual(
      [
        links(RANGE_PLATFORM2, PLATFORM2),
        links(RANGE_SYSTEM_KEYMINT, SYSTEM_KEYMINT),
      ].flat()
    );
  });
});
