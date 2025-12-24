// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {EbuildLspClient} from '../../../../features/chromiumos/ebuild/lsp_client';
import * as testing from '../../../testing';
import {VoidOutputChannel} from '../../../testing/fakes';
import {closeDocument} from '../../extension_testing';

const csBase =
  'http://source.corp.google.com/h/chromium/chromiumos/codesearch/+/main:';

function documentLink(
  range: vscode.Range,
  target: vscode.Uri,
  _tooltip: string
) {
  const link = new vscode.DocumentLink(range, target);

  // TODO(b/343857580): Ensure `vscode.executeLinkProvider` command fills `tooltip` and use tooltip
  // in the return value to restore test coverage for tooltip.

  return jasmine.objectContaining({
    range: link.range,
    target: link.target,
  });
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
  chromiumosRoot: string,
  range: vscode.Range,
  subpath: string,
  remoteHost: string | undefined = undefined
) {
  return [
    documentLink(
      range,
      vscode.Uri.parse(csBase + subpath),
      `Open ${subpath} in CodeSearch`
    ),
    documentLink(
      range,
      openFolderCmdUri(path.join(chromiumosRoot, subpath), remoteHost),
      `Open ${subpath} in New VS Code Window`
    ),
  ];
}

/**
 * Return the pair of external codesearch link and vscode document link
 * for given range and file path, assuming it is a file.
 */
function fileLinks(
  chromiumosRoot: string,
  range: vscode.Range,
  subpath: string
) {
  return [
    documentLink(
      range,
      vscode.Uri.file(path.join(chromiumosRoot, subpath)),
      `Open ${subpath} in New Tab`
    ),
    documentLink(
      range,
      vscode.Uri.parse(csBase + subpath),
      `Open ${subpath} in CodeSearch`
    ),
  ];
}

async function buildFs(
  chromiumosRoot: string,
  opts: {
    dirs?: string[];
    emptyFiles?: string[];
    files?: {[key: string]: string};
  }
) {
  for (const dir of opts?.dirs ?? []) {
    await fs.promises.mkdir(path.join(chromiumosRoot, dir), {recursive: true});
  }
  await testing.putFiles(
    chromiumosRoot,
    opts.emptyFiles?.reduce((obj, key) => ({...obj, [key]: ''}), {}) ?? {}
  );
  await testing.putFiles(chromiumosRoot, opts.files ?? {});
}

async function activate(
  chromiumosRoot: string,
  asyncDisposes: (() => Promise<void>)[],
  remoteName = vscode.env.remoteName
): Promise<void> {
  const client = new EbuildLspClient(
    testing.getExtensionUri(),
    chromiumosRoot,
    new VoidOutputChannel(),
    remoteName
  );
  await client.start();
  asyncDisposes.push(() => client.disposeAsync());
}

// It seems `vscode.executeLinkProvider` is buggy and doesn't fill
// the `tooltip` field. https://github.com/microsoft/vscode/issues/213970
// Internal bug for follow up: b/343857580
async function provideDocumentLinks(
  uri: vscode.Uri
): Promise<vscode.DocumentLink[]> {
  return await vscode.commands.executeCommand(
    'vscode.executeLinkProvider',
    uri
  );
}

describe('Ebuild Link Provider', () => {
  const tempDir = testing.tempDir();

  const state = testing.cleanState(() => {
    const chromiumosRoot = tempDir.path;

    return {
      chromiumosRoot,
      dirLinks: dirLinks.bind(null, chromiumosRoot),
      fileLinks: fileLinks.bind(null, chromiumosRoot),
    };
  });

  const asyncDisposes: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const x of asyncDisposes) {
      await x();
    }
  });

  const openDocument = async (subpath: string) => {
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(state.chromiumosRoot, subpath))
    );
    asyncDisposes.push(() => closeDocument(doc));
    return doc;
  };

  it('on CROS_WORKON extracts links from string-type value', async () => {
    await activate(state.chromiumosRoot, asyncDisposes);

    const CONTENT = `# copyright
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
    await buildFs(state.chromiumosRoot, {
      dirs: [PLATFORM2, COMMONMK, BIOD],
      emptyFiles: [GN],
      files: {'foo.ebuild': CONTENT},
    });

    const ebuild = await openDocument('foo.ebuild');

    const documentLinks = await provideDocumentLinks(ebuild.uri);

    const RANGE_PLATFORM2 = new vscode.Range(3, 23, 3, 32);
    const RANGE_COMMONMK = new vscode.Range(6, 21, 6, 30);
    const RANGE_BIOD = new vscode.Range(6, 31, 6, 35);
    const RANGE_GN = new vscode.Range(6, 36, 6, 39);

    expect(documentLinks).toEqual(
      [
        state.dirLinks(RANGE_PLATFORM2, PLATFORM2),
        state.dirLinks(RANGE_COMMONMK, COMMONMK),
        state.dirLinks(RANGE_BIOD, BIOD),
        state.fileLinks(RANGE_GN, GN),
      ].flat()
    );
  });

  it('on CROS_WORKON extracts links from one-line array-type value', async () => {
    await activate(state.chromiumosRoot, asyncDisposes);

    const CONTENT = `# copyright
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
    await buildFs(state.chromiumosRoot, {
      dirs: [PLATFORM2, VPD, COMMONMK],
      emptyFiles: [GN],
      files: {'foo.ebuild': CONTENT},
    });

    const ebuild = await openDocument('foo.ebuild');

    const documentLinks = await provideDocumentLinks(ebuild.uri);

    const RANGE_PLATFORM2 = new vscode.Range(3, 24, 3, 33);
    const RANGE_VPD = new vscode.Range(3, 36, 3, 48);
    const RANGE_COMMONMK = new vscode.Range(5, 22, 5, 31);
    const RANGE_GN = new vscode.Range(5, 32, 5, 35);

    expect(documentLinks).toEqual(
      [
        state.dirLinks(RANGE_PLATFORM2, PLATFORM2),
        state.dirLinks(RANGE_VPD, VPD),
        state.dirLinks(RANGE_COMMONMK, COMMONMK),
        state.fileLinks(RANGE_GN, GN),
      ].flat()
    );
  });

  it('on CROS_WORKON extracts links from multiple-line array-type value', async () => {
    await activate(state.chromiumosRoot, asyncDisposes);

    const CONTENT = `# copyright
EAPI=7

CROS_WORKON_LOCALNAME=(
  "platform2"
  "aosp/system/keymint"
  "aosp/system/core/libcutils"
)

CROS_WORKON_INCREMENTAL_BUILD="1"

CROS_WORKON_DESTDIR=(
  "\${S}/platform2"
  "\${S}/aosp/system/keymint"
  "\${S}/aosp/system/core/libcutils"
)

CROS_WORKON_SUBTREE=(
  "common-mk featured arc/keymint .gn"
  ""
  ""
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
    await buildFs(state.chromiumosRoot, {
      dirs: [
        PLATFORM2,
        SYSTEM_KEYMINT,
        LIBCUTILS,
        COMMONMK,
        FEATURED,
        ARC_KEYMINT,
      ],
      emptyFiles: [GN],
      files: {'foo.ebuild': CONTENT},
    });

    const ebuild = await openDocument('foo.ebuild');

    const documentLinks = await provideDocumentLinks(ebuild.uri);

    const RANGE_PLATFORM2 = new vscode.Range(4, 3, 4, 12);
    const RANGE_SYSTEM_KEYMINT = new vscode.Range(5, 3, 5, 22);
    const RANGE_LIBCUTILS = new vscode.Range(6, 3, 6, 29);
    const RANGE_COMMONMK = new vscode.Range(18, 3, 18, 12);
    const RANGE_FEATURED = new vscode.Range(18, 13, 18, 21);
    const RANGE_ARC_KEYMINT = new vscode.Range(18, 22, 18, 33);
    const RANGE_GN = new vscode.Range(18, 34, 18, 37);

    expect(documentLinks).toEqual(
      [
        state.dirLinks(RANGE_PLATFORM2, PLATFORM2),
        state.dirLinks(RANGE_SYSTEM_KEYMINT, SYSTEM_KEYMINT),
        state.dirLinks(RANGE_LIBCUTILS, LIBCUTILS),
        state.dirLinks(RANGE_COMMONMK, COMMONMK),
        state.dirLinks(RANGE_FEATURED, FEATURED),
        state.dirLinks(RANGE_ARC_KEYMINT, ARC_KEYMINT),
        state.fileLinks(RANGE_GN, GN),
      ].flat()
    );
  });

  it('on CROS_WORKON handles local name with leading two dots', async () => {
    await activate(state.chromiumosRoot, asyncDisposes);

    const CONTENT = `# copyright
EAPI="7"
CROS_WORKON_PROJECT="chromiumos/platform/tpm"
CROS_WORKON_LOCALNAME="../third_party/tpm"
`;

    const TPM = 'src/third_party/tpm';
    await buildFs(state.chromiumosRoot, {
      dirs: [TPM],
      files: {'foo.ebuild': CONTENT},
    });

    const ebuild = await openDocument('foo.ebuild');

    const documentLinks = await provideDocumentLinks(ebuild.uri);

    const RANGE_TPM = new vscode.Range(3, 23, 3, 41);

    expect(documentLinks).toEqual([state.dirLinks(RANGE_TPM, TPM)].flat());
  });

  it('on CROS_WORKON does not generate subtree links when length does not match localname', async () => {
    await activate(state.chromiumosRoot, asyncDisposes);

    const CONTENT = `# copyright
EAPI=7

CROS_WORKON_LOCALNAME=(
  "platform2"
  "aosp/system/keymint"
)

CROS_WORKON_SUBTREE=(
  "common-mk featured arc/keymint .gn"
)
PLATFORM_SUBDIR="arc/keymint"
`;

    const PLATFORM2 = 'src/platform2';
    const SYSTEM_KEYMINT = 'src/aosp/system/keymint';
    await buildFs(state.chromiumosRoot, {
      dirs: [PLATFORM2, SYSTEM_KEYMINT],
      files: {'foo.ebuild': CONTENT},
    });

    const ebuild = await openDocument('foo.ebuild');

    const documentLinks = await provideDocumentLinks(ebuild.uri);

    const RANGE_PLATFORM2 = new vscode.Range(4, 3, 4, 12);
    const RANGE_SYSTEM_KEYMINT = new vscode.Range(5, 3, 5, 22);

    expect(documentLinks).toEqual(
      [
        state.dirLinks(RANGE_PLATFORM2, PLATFORM2),
        state.dirLinks(RANGE_SYSTEM_KEYMINT, SYSTEM_KEYMINT),
      ].flat()
    );
  });

  it('on CROS_WORKON generates remote links', async () => {
    // 'ssh-remote' will change the links to open folders
    await activate(state.chromiumosRoot, asyncDisposes, 'ssh-remote');

    const CONTENT = `# copyright
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
    await buildFs(state.chromiumosRoot, {
      dirs: [PLATFORM2, COMMONMK],
      emptyFiles: [GN],
      files: {
        'foo.ebuild': CONTENT,
      },
    });

    const ebuild = await openDocument('foo.ebuild');

    const documentLinks = await provideDocumentLinks(ebuild.uri);

    const RANGE_PLATFORM2 = new vscode.Range(3, 24, 3, 33);
    const RANGE_COMMONMK = new vscode.Range(5, 22, 5, 31);
    const RANGE_GN = new vscode.Range(5, 32, 5, 35);

    const HOSTNAME = os.hostname();

    expect(documentLinks).toEqual(
      [
        state.dirLinks(RANGE_PLATFORM2, PLATFORM2, HOSTNAME),
        state.dirLinks(RANGE_COMMONMK, COMMONMK, HOSTNAME),
        state.fileLinks(RANGE_GN, GN),
      ].flat()
    );
  });

  it('on CROS_WORKON does not generate remote vscode links for non-ssh-remote', async () => {
    // Remote links that are not 'ssh-remote' should not generate folder links due to b/311555429.
    await activate(state.chromiumosRoot, asyncDisposes, 'localhost:8080');

    const CONTENT = `# copyright
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
    await buildFs(state.chromiumosRoot, {
      dirs: [PLATFORM2, COMMONMK],
      emptyFiles: [GN],
      files: {
        'foo.ebuild': CONTENT,
      },
    });

    const ebuild = await openDocument('foo.ebuild');

    const documentLinks = await provideDocumentLinks(ebuild.uri);

    const RANGE_PLATFORM2 = new vscode.Range(3, 24, 3, 33);
    const RANGE_COMMONMK = new vscode.Range(5, 22, 5, 31);
    const RANGE_GN = new vscode.Range(5, 32, 5, 35);

    const HOSTNAME = os.hostname();

    // For directory, only generates the CS link but not the vscode link.
    expect(documentLinks).toEqual(
      [
        state.dirLinks(RANGE_PLATFORM2, PLATFORM2, HOSTNAME)[0],
        state.dirLinks(RANGE_COMMONMK, COMMONMK, HOSTNAME)[0],
        state.fileLinks(RANGE_GN, GN),
      ].flat()
    );
  });

  it('on CROS_WORKON ignores missing files', async () => {
    await activate(state.chromiumosRoot, asyncDisposes);

    const CONTENT = `# copyright
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
    await buildFs(state.chromiumosRoot, {
      dirs: [PLATFORM2, BIOD],
      files: {'foo.ebuild': CONTENT},
    });

    const ebuild = await openDocument('foo.ebuild');

    const documentLinks = await provideDocumentLinks(ebuild.uri);

    const RANGE_PLATFORM2 = new vscode.Range(3, 23, 3, 32);
    const RANGE_BIOD = new vscode.Range(6, 21, 6, 25);

    expect(documentLinks).toEqual(
      [
        state.dirLinks(RANGE_PLATFORM2, PLATFORM2),
        state.dirLinks(RANGE_BIOD, BIOD),
      ].flat()
    );
  });

  it('on inherits handles single inherit', async () => {
    await activate(state.chromiumosRoot, asyncDisposes);

    const CONTENT = `# copyright
EAPI=7
inherit cros-constants
`;

    await testing.putFiles(tempDir.path, {
      'src/third_party/eclass-overlay/eclass/cros-constants.eclass':
        'cros-constants',
      'foo.ebuild': CONTENT,
    });

    const ebuild = await openDocument('foo.ebuild');

    const documentLinks = await provideDocumentLinks(ebuild.uri);

    expect(documentLinks).toEqual(
      [
        // cros-constants
        fileLinks(
          tempDir.path,
          new vscode.Range(2, 8, 2, 22),
          'src/third_party/eclass-overlay/eclass/cros-constants.eclass'
        ),
      ].flat()
    );
  });

  it('on inherits handles multiple inherit', async () => {
    await activate(state.chromiumosRoot, asyncDisposes);

    const CONTENT = `# copyright
EAPI=7
inherit cros-sanitizers cros-workon toolchain-funcs
`;

    await testing.putFiles(tempDir.path, {
      'src/third_party/chromiumos-overlay/eclass/cros-sanitizers.eclass':
        'cros-sanitizers',
      'src/third_party/chromiumos-overlay/eclass/cros-workon.eclass':
        'cros-workon',
      'src/third_party/chromiumos-overlay/eclass/toolchain-funcs.eclass':
        'toolchain-funcs',
      'foo.ebuild': CONTENT,
    });

    const ebuild = await openDocument('foo.ebuild');

    const documentLinks = await provideDocumentLinks(ebuild.uri);

    expect(documentLinks).toEqual(
      [
        // cros-sanitizers
        fileLinks(
          tempDir.path,
          new vscode.Range(2, 8, 2, 23),
          'src/third_party/chromiumos-overlay/eclass/cros-sanitizers.eclass'
        ),
        // cros-workon
        fileLinks(
          tempDir.path,
          new vscode.Range(2, 24, 2, 35),
          'src/third_party/chromiumos-overlay/eclass/cros-workon.eclass'
        ),
        // toolchain-funcs
        fileLinks(
          tempDir.path,
          new vscode.Range(2, 36, 2, 51),
          'src/third_party/chromiumos-overlay/eclass/toolchain-funcs.eclass'
        ),
      ].flat()
    );
  });

  it('on inherits does not generate link when eclass not found', async () => {
    await activate(state.chromiumosRoot, asyncDisposes);

    const CONTENT = `# copyright
EAPI=7
inherit non-exist-eclass
`;
    await testing.putFiles(state.chromiumosRoot, {
      'foo.ebuild': CONTENT,
    });

    const ebuild = await openDocument('foo.ebuild');

    const documentLinks = await provideDocumentLinks(ebuild.uri);

    expect(documentLinks).toEqual([]);
  });
});
