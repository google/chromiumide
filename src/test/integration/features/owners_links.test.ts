// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as ownersLinkProvider from '../../../features/owners_links';
import * as testing from '../../testing';
import {FakeCancellationToken} from '../../testing/fakes';
import * as extensionTesting from '../extension_testing';

// Create a `vscode.TextDocument` from text and run `OwnersLinkProvider` on it.
async function getLinks(text: string, dir: string) {
  await testing.putFiles(dir, {
    OWNERS: text,
  });
  const document = await vscode.workspace.openTextDocument(
    path.join(dir, 'OWNERS')
  );
  const provider = new ownersLinkProvider.OwnersLinkProvider();
  const links = await provider.provideDocumentLinks(
    document,
    new FakeCancellationToken()
  );
  await extensionTesting.closeDocument(document);
  return {links, documentUri: document.uri};
}

// Uses `OwnersLinkProvider` to resolve an `OwnersLink`.
async function resolveLink(link: ownersLinkProvider.OwnersLink) {
  const provider = new ownersLinkProvider.OwnersLinkProvider();
  expect(link.target).toBeUndefined();
  await provider.resolveDocumentLink(link, new FakeCancellationToken());
}

describe('OWNERS links', () => {
  const tempDir = testing.tempDir();

  it('ignores links with project or branch references', async () => {
    // We do not support project or branch references for now.
    const text = `\
file:project:/path
file:project:branch:/path
include project:/path
include project:branch:/path
`;

    const {links} = await getLinks(text, tempDir.path);
    expect(links).toEqual([]);
  });

  it('ignores links in comments', async () => {
    const text = `\
# file:/path
foo # file:/path
# include /path
foo # include /path
`;

    const {links} = await getLinks(text, tempDir.path);
    expect(links).toEqual([]);
  });

  (['file', 'include'] as const).forEach(type => {
    const prefix = type === 'include' ? 'include ' : 'file:';

    it(`extracts absolute ${type} links with double slashes`, async () => {
      const text = `${prefix}//tools/translation/TRANSLATION_OWNERS`;

      const {links, documentUri} = await getLinks(text, tempDir.path);
      expect(links).toEqual([
        new ownersLinkProvider.OwnersLink(
          '/tools/translation/TRANSLATION_OWNERS',
          documentUri,
          new vscode.Range(0, 0, 0, text.length)
        ),
      ]);
    });

    it(`extracts absolute ${type} links with a single slash`, async () => {
      const text = `${prefix}/tools/translation/TRANSLATION_OWNERS`;

      const {links, documentUri} = await getLinks(text, tempDir.path);
      expect(links).toEqual([
        new ownersLinkProvider.OwnersLink(
          '/tools/translation/TRANSLATION_OWNERS',
          documentUri,
          new vscode.Range(0, 0, 0, text.length)
        ),
      ]);
    });

    it(`extracts relative ${type} links`, async () => {
      const text = `${prefix}tools/../translation/TRANSLATION_OWNERS`;

      const {links, documentUri} = await getLinks(text, tempDir.path);
      expect(links).toEqual([
        new ownersLinkProvider.OwnersLink(
          'tools/../translation/TRANSLATION_OWNERS',
          documentUri,
          new vscode.Range(0, 0, 0, text.length)
        ),
      ]);
    });

    it(`extracts ${type} links with special characters`, async () => {
      const text = `${prefix}/styleguide/c++/OWNERS`;

      const {links, documentUri} = await getLinks(text, tempDir.path);
      expect(links).toEqual([
        new ownersLinkProvider.OwnersLink(
          '/styleguide/c++/OWNERS',
          documentUri,
          new vscode.Range(0, 0, 0, text.length)
        ),
      ]);
    });
  });

  it('correctly extracts the clickable range', async () => {
    const text = `\
  file:/path1
per-file foo.txt =   file:/path2
  include   /path3  # test`;
    const {links, documentUri} = await getLinks(text, tempDir.path);
    expect(links).toEqual([
      new ownersLinkProvider.OwnersLink(
        '/path1',
        documentUri,
        new vscode.Range(0, 2, 0, 13)
      ),
      new ownersLinkProvider.OwnersLink(
        '/path2',
        documentUri,
        new vscode.Range(1, 21, 1, 32)
      ),
      new ownersLinkProvider.OwnersLink(
        '/path3',
        documentUri,
        new vscode.Range(2, 2, 2, 18)
      ),
    ]);
  });

  it('resolves link with relative path', async () => {
    const link = new ownersLinkProvider.OwnersLink(
      'foo/bar/baz/..',
      vscode.Uri.file('/some/OWNERS'),
      new vscode.Range(0, 0, 0, 10)
    );

    await resolveLink(link);
    expect(link.target).toEqual(vscode.Uri.file('/some/foo/bar'));
  });

  it('resolves link with absolute path', async () => {
    const git = new testing.Git(tempDir.path);

    await testing.cachedSetup(
      tempDir.path,
      async () => {
        await git.init();
      },
      'owners_links_resolves_link_with_absolute_path'
    );

    await testing.putFiles(tempDir.path, {
      OWNERS: 'fake',
    });

    const link = new ownersLinkProvider.OwnersLink(
      '/foo/bar/baz/..',
      vscode.Uri.file(path.join(tempDir.path, 'OWNERS')),
      new vscode.Range(0, 0, 0, 10)
    );

    await resolveLink(link);
    expect(link.target).toEqual(
      vscode.Uri.file(path.join(tempDir.path, 'foo/bar'))
    );
  });
});
