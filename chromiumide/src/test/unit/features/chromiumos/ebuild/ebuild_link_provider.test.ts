// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as vscode from 'vscode';
import dedent from 'dedent';
import mockFs from 'mock-fs';
import {EbuildLinkProvider} from '../../../../../features/chromiumos/ebuild/ebuild_link_provider';
import * as testing from '../../../../testing';
import {
  FakeCancellationToken,
  FakeTextDocument,
} from '../../../../testing/fakes';

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

function openFolderCmdUri(
  path: string,
  remoteHost: string | undefined
): vscode.Uri {
  const uri = remoteHost
    ? vscode.Uri.parse(`vscode-remote://ssh-remote+${remoteHost}${path}`)
    : vscode.Uri.file(path);
  return vscode.Uri.parse(
    `command:vscode.openFolder?${encodeURIComponent(
      JSON.stringify([
        uri,
        {
          forceNewWindow: true,
        },
      ])
    )}`
  );
}

/**
 * Return the pair of external codesearch link and vscode document link
 * for given range and file path, assuming it is a directory.
 */
function dirLinks(
  range: vscode.Range,
  path: string,
  pathToCros = '/path/to/cros',
  remoteHost: string | undefined = undefined
): vscode.DocumentLink[] {
  return [
    documentLink(
      range,
      vscode.Uri.parse(csBase + path),
      `Open ${path} in CodeSearch`
    ),
    documentLink(
      range,
      openFolderCmdUri(`${pathToCros}/${path}`, remoteHost),
      `Open ${path} in New VS Code Window`
    ),
  ];
}

/**
 * Return the pair of external codesearch link and vscode document link
 * for given range and file path, assuming it is a file.
 */
function fileLinks(
  range: vscode.Range,
  path: string,
  pathToCros = '/path/to/cros'
): vscode.DocumentLink[] {
  return [
    documentLink(
      range,
      vscode.Uri.file(`${pathToCros}/${path}`),
      `Open ${path} in New Tab`
    ),
    documentLink(
      range,
      vscode.Uri.parse(csBase + path),
      `Open ${path} in CodeSearch`
    ),
  ];
}

/** Wrapper for mock-fs. */
function mockEbuildFs(root: string, opts: {dirs?: string[]; files?: string[]}) {
  // Directories are configure by `{path: {}}` objects.
  const dirConfig = opts.dirs
    ? opts.dirs
        .map(dir => root + dir)
        .reduce((obj, key) => ({...obj, [key]: {}}), {})
    : {};

  // Regular files are configure by `{path: ''}` objects.
  const fileConfig = opts.files
    ? opts.files
        .map(f => root + f)
        .reduce((obj, key) => ({...obj, [key]: ''}), {})
    : {};

  mockFs({...dirConfig, ...fileConfig});
}

describe('Ebuild Link Provider for CROS_WORKON variables', () => {
  afterEach(() => {
    mockFs.restore();
  });

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

    const PLATFORM2 = 'src/platform2';
    const COMMONMK = PLATFORM2 + '/common-mk';
    const BIOD = PLATFORM2 + '/biod';
    const GN = PLATFORM2 + '/.gn';
    mockEbuildFs('/path/to/cros/', {
      dirs: [PLATFORM2, COMMONMK, BIOD],
      files: [GN],
    });

    const ebuildLinkProvider = new EbuildLinkProvider('/path/to/cros');
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = await ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_PLATFORM2 = new vscode.Range(3, 23, 3, 32);
    const RANGE_COMMONMK = new vscode.Range(6, 21, 6, 30);
    const RANGE_BIOD = new vscode.Range(6, 31, 6, 35);
    const RANGE_GN = new vscode.Range(6, 36, 6, 39);

    expect(documentLinks).toEqual(
      [
        dirLinks(RANGE_PLATFORM2, PLATFORM2),
        dirLinks(RANGE_COMMONMK, COMMONMK),
        dirLinks(RANGE_BIOD, BIOD),
        fileLinks(RANGE_GN, GN),
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

    const PLATFORM2 = 'src/platform2';
    const VPD = 'src/platform/vpd';
    const COMMONMK = PLATFORM2 + '/common-mk';
    const GN = PLATFORM2 + '/.gn';
    mockEbuildFs('/path/to/cros/', {
      dirs: [PLATFORM2, VPD, COMMONMK],
      files: [GN],
    });

    const ebuildLinkProvider = new EbuildLinkProvider('/path/to/cros');
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = await ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_PLATFORM2 = new vscode.Range(3, 24, 3, 33);
    const RANGE_VPD = new vscode.Range(3, 36, 3, 48);
    const RANGE_COMMONMK = new vscode.Range(5, 22, 5, 31);
    const RANGE_GN = new vscode.Range(5, 32, 5, 35);

    expect(documentLinks).toEqual(
      [
        dirLinks(RANGE_PLATFORM2, PLATFORM2),
        dirLinks(RANGE_VPD, VPD),
        dirLinks(RANGE_COMMONMK, COMMONMK),
        fileLinks(RANGE_GN, GN),
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

    const PLATFORM2 = 'src/platform2';
    const SYSTEM_KEYMINT = 'src/aosp/system/keymint';
    const LIBCUTILS = 'src/aosp/system/core/libcutils';
    const COMMONMK = PLATFORM2 + '/common-mk';
    const FEATURED = PLATFORM2 + '/featured';
    const ARC_KEYMINT = PLATFORM2 + '/arc/keymint';
    const GN = PLATFORM2 + '/.gn';
    mockEbuildFs('/path/to/cros/', {
      dirs: [
        PLATFORM2,
        SYSTEM_KEYMINT,
        LIBCUTILS,
        COMMONMK,
        FEATURED,
        ARC_KEYMINT,
      ],
      files: [GN],
    });

    const ebuildLinkProvider = new EbuildLinkProvider('/path/to/cros');
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = await ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_PLATFORM2 = new vscode.Range(4, 3, 4, 12);
    const RANGE_SYSTEM_KEYMINT = new vscode.Range(5, 3, 5, 22);
    const RANGE_LIBCUTILS = new vscode.Range(6, 3, 6, 29);
    const RANGE_COMMONMK = new vscode.Range(18, 3, 18, 12);
    const RANGE_FEATURED = new vscode.Range(18, 13, 18, 21);
    const RANGE_ARC_KEYMINT = new vscode.Range(18, 22, 18, 33);
    const RANGE_GN = new vscode.Range(18, 34, 18, 37);

    expect(documentLinks).toEqual(
      [
        dirLinks(RANGE_PLATFORM2, PLATFORM2),
        dirLinks(RANGE_SYSTEM_KEYMINT, SYSTEM_KEYMINT),
        dirLinks(RANGE_LIBCUTILS, LIBCUTILS),
        dirLinks(RANGE_COMMONMK, COMMONMK),
        dirLinks(RANGE_FEATURED, FEATURED),
        dirLinks(RANGE_ARC_KEYMINT, ARC_KEYMINT),
        fileLinks(RANGE_GN, GN),
      ].flat()
    );
  });

  it('handles local name with leading two dots', async () => {
    const CONTENT = `# copyright
EAPI="7"
CROS_WORKON_PROJECT="chromiumos/platform/tpm"
CROS_WORKON_LOCALNAME="../third_party/tpm"
    `;

    const TPM = 'src/third_party/tpm';
    mockEbuildFs('/path/to/cros/', {dirs: [TPM]});

    const ebuildLinkProvider = new EbuildLinkProvider('/path/to/cros');
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = await ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_TPM = new vscode.Range(3, 23, 3, 41);

    expect(documentLinks).toEqual([dirLinks(RANGE_TPM, TPM)].flat());
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

    const PLATFORM2 = 'src/platform2';
    const SYSTEM_KEYMINT = 'src/aosp/system/keymint';
    mockEbuildFs('/path/to/cros/', {
      dirs: [PLATFORM2, SYSTEM_KEYMINT],
    });

    const ebuildLinkProvider = new EbuildLinkProvider('/path/to/cros');
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = await ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_PLATFORM2 = new vscode.Range(4, 3, 4, 12);
    const RANGE_SYSTEM_KEYMINT = new vscode.Range(5, 3, 5, 22);

    expect(documentLinks).toEqual(
      [
        dirLinks(RANGE_PLATFORM2, PLATFORM2),
        dirLinks(RANGE_SYSTEM_KEYMINT, SYSTEM_KEYMINT),
      ].flat()
    );
  });

  it('generates remote links', async () => {
    const CONTENT = dedent`# copyright
    EAPI=7
    CROS_WORKON_PROJECT=("chromiumos/platform2")
    CROS_WORKON_LOCALNAME=("platform2")
    CROS_WORKON_DESTDIR=("\${S}/platform2")
    CROS_WORKON_SUBTREE=("common-mk .gn")

    PLATFORM_SUBDIR="vpd"
    `;

    const PLATFORM2 = 'src/platform2';
    const COMMONMK = PLATFORM2 + '/common-mk';
    const GN = PLATFORM2 + '/.gn';
    const CHROOT = '/path/to/cros';
    mockEbuildFs('/path/to/cros/', {
      dirs: [PLATFORM2, COMMONMK],
      files: [GN],
    });

    const ebuildLinkProvider = new EbuildLinkProvider(
      CHROOT,
      // 'ssh-remote' will change the links to open folders
      () => 'ssh-remote'
    );
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = await ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_PLATFORM2 = new vscode.Range(3, 24, 3, 33);
    const RANGE_COMMONMK = new vscode.Range(5, 22, 5, 31);
    const RANGE_GN = new vscode.Range(5, 32, 5, 35);

    const HOSTNAME = os.hostname();

    expect(documentLinks).toEqual(
      [
        dirLinks(RANGE_PLATFORM2, PLATFORM2, CHROOT, HOSTNAME),
        dirLinks(RANGE_COMMONMK, COMMONMK, CHROOT, HOSTNAME),
        fileLinks(RANGE_GN, GN),
      ].flat()
    );
  });

  it('does not generate remote vscode links for non-ssh-remote', async () => {
    const CONTENT = dedent`# copyright
    EAPI=7
    CROS_WORKON_PROJECT=("chromiumos/platform2")
    CROS_WORKON_LOCALNAME=("platform2")
    CROS_WORKON_DESTDIR=("\${S}/platform2")
    CROS_WORKON_SUBTREE=("common-mk .gn")

    PLATFORM_SUBDIR="vpd"
    `;

    const PLATFORM2 = 'src/platform2';
    const COMMONMK = PLATFORM2 + '/common-mk';
    const GN = PLATFORM2 + '/.gn';
    const CHROOT = '/path/to/cros';
    mockEbuildFs('/path/to/cros/', {
      dirs: [PLATFORM2, COMMONMK],
      files: [GN],
    });

    const ebuildLinkProvider = new EbuildLinkProvider(
      CHROOT,
      // Remote links that are not 'ssh-remote' should not generate folder links due to b/311555429.
      () => 'localhost:8080'
    );
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = await ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_PLATFORM2 = new vscode.Range(3, 24, 3, 33);
    const RANGE_COMMONMK = new vscode.Range(5, 22, 5, 31);
    const RANGE_GN = new vscode.Range(5, 32, 5, 35);

    const HOSTNAME = os.hostname();

    // For directory, only generates the CS link but not the vscode link.
    expect(documentLinks).toEqual(
      [
        dirLinks(RANGE_PLATFORM2, PLATFORM2, CHROOT, HOSTNAME)[0],
        dirLinks(RANGE_COMMONMK, COMMONMK, CHROOT, HOSTNAME)[0],
        fileLinks(RANGE_GN, GN),
      ].flat()
    );
  });

  it('ignores missing files', async () => {
    const CONTENT = dedent`# copyright
        EAPI=7
        CROS_WORKON_USE_VCSID="1"
        CROS_WORKON_LOCALNAME="platform2"
        CROS_WORKON_PROJECT="chromiumos/platform2"
        CROS_WORKON_OUTOFTREE_BUILD=1
        CROS_WORKON_SUBTREE="biod missing"
        PLATFORM_SUBDIR="biod"
        `;

    const PLATFORM2 = 'src/platform2';
    const BIOD = PLATFORM2 + '/biod';
    mockEbuildFs('/path/to/cros/', {
      dirs: [PLATFORM2, BIOD],
    });

    const ebuildLinkProvider = new EbuildLinkProvider('/path/to/cros');
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = await ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    const RANGE_PLATFORM2 = new vscode.Range(3, 23, 3, 32);
    const RANGE_BIOD = new vscode.Range(6, 21, 6, 25);

    expect(documentLinks).toEqual(
      [dirLinks(RANGE_PLATFORM2, PLATFORM2), dirLinks(RANGE_BIOD, BIOD)].flat()
    );
  });
});

describe('Ebuild Link Provider for inherits', () => {
  const tempDir = testing.tempDir();

  it('handles single inherit', async () => {
    await testing.putFiles(tempDir.path, {
      'src/third_party/eclass-overlay/eclass/cros-constants.eclass':
        'cros-constants',
    });

    const CONTENT = `# copyright
EAPI=7
inherit cros-constants
  `;
    const ebuildLinkProvider = new EbuildLinkProvider(tempDir.path);
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = await ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    expect(documentLinks).toEqual(
      [
        // cros-constants
        fileLinks(
          new vscode.Range(2, 8, 2, 22),
          'src/third_party/eclass-overlay/eclass/cros-constants.eclass',
          tempDir.path
        ),
      ].flat()
    );
  });

  it('handles multiple inherit', async () => {
    await testing.putFiles(tempDir.path, {
      'src/third_party/chromiumos-overlay/eclass/cros-sanitizers.eclass':
        'cros-sanitizers',
      'src/third_party/chromiumos-overlay/eclass/cros-workon.eclass':
        'cros-workon',
      'src/third_party/chromiumos-overlay/eclass/toolchain-funcs.eclass':
        'toolchain-funcs',
    });
    const CONTENT = `# copyright
EAPI=7
inherit cros-sanitizers cros-workon toolchain-funcs
  `;
    const ebuildLinkProvider = new EbuildLinkProvider(tempDir.path);
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = await ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    expect(documentLinks).toEqual(
      [
        // cros-sanitizers
        fileLinks(
          new vscode.Range(2, 8, 2, 23),
          'src/third_party/chromiumos-overlay/eclass/cros-sanitizers.eclass',
          tempDir.path
        ),
        // cros-workon
        fileLinks(
          new vscode.Range(2, 24, 2, 35),
          'src/third_party/chromiumos-overlay/eclass/cros-workon.eclass',
          tempDir.path
        ),
        // toolchain-funcs
        fileLinks(
          new vscode.Range(2, 36, 2, 51),
          'src/third_party/chromiumos-overlay/eclass/toolchain-funcs.eclass',
          tempDir.path
        ),
      ].flat()
    );
  });

  it('does not generate link when eclass not found', async () => {
    const CONTENT = `# copyright
EAPI=7
inherit non-exist-eclass
  `;
    const ebuildLinkProvider = new EbuildLinkProvider(tempDir.path);
    const textDocument = new FakeTextDocument({text: CONTENT});

    const documentLinks = await ebuildLinkProvider.provideDocumentLinks(
      textDocument,
      new FakeCancellationToken()
    );

    expect(documentLinks).toEqual([]);
  });
});
