// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as assert from 'assert';
import {FakeCancellationToken} from '../../testing/fakes';
import * as commonUtil from '../../../common/common_util';
import * as extensionTesting from '../extension_testing';
import * as ownersLinkProvider from '../../../features/owners_links';

// Create a `vscode.TextDocument` from text and run `OwnersLinkProvider` on it.
async function getLinks(text: string) {
  const document = await vscode.workspace.openTextDocument({content: text});
  const provider = new ownersLinkProvider.OwnersLinkProvider();
  const links = await provider.provideDocumentLinks(
    document,
    new FakeCancellationToken()
  );
  await extensionTesting.closeDocument(document);
  return {links, documentUri: document.uri};
}

// Uses `OwnersLinkProvider` to resolve an `OwnersLink`.
function resolveLink(link: ownersLinkProvider.OwnersLink) {
  const provider = new ownersLinkProvider.OwnersLinkProvider();
  assert.strictEqual(link.target, undefined);
  provider.resolveDocumentLink(link, new FakeCancellationToken());
}

describe('OWNERS links', () => {
  it('ignores links with project or branch references', async () => {
    // We do not support project or branch references for now.
    const text = `\
file:project:/path
file:project:branch:/path
include project:/path
include project:branch:/path
`;

    const {links} = await getLinks(text);
    assert.ok(links);
    assert.deepStrictEqual(links, []);
  });

  it('ignores links in comments', async () => {
    const text = `\
# file:/path
foo # file:/path
# include /path
foo # include /path
`;

    const {links} = await getLinks(text);
    assert.ok(links);
    assert.deepStrictEqual(links, []);
  });

  (['file', 'include'] as const).forEach(type => {
    const prefix = type === 'include' ? 'include ' : 'file:';

    it(`extracts absolute ${type} links with double slashes`, async () => {
      const text = `${prefix}//tools/translation/TRANSLATION_OWNERS`;

      const {links, documentUri} = await getLinks(text);
      assert.ok(links);
      assert.strictEqual(links.length, 1);
      assert.deepStrictEqual(
        links[0],
        new ownersLinkProvider.OwnersLink(
          '/tools/translation/TRANSLATION_OWNERS',
          documentUri,
          new vscode.Range(0, 0, 0, text.length)
        )
      );
    });

    it(`extracts absolute ${type} links with a single slash`, async () => {
      const text = `${prefix}/tools/translation/TRANSLATION_OWNERS`;

      const {links, documentUri} = await getLinks(text);
      assert.ok(links);
      assert.strictEqual(links.length, 1);
      assert.deepStrictEqual(
        links[0],
        new ownersLinkProvider.OwnersLink(
          '/tools/translation/TRANSLATION_OWNERS',
          documentUri,
          new vscode.Range(0, 0, 0, text.length)
        )
      );
    });

    it(`extracts relative ${type} links`, async () => {
      const text = `${prefix}tools/../translation/TRANSLATION_OWNERS`;

      const {links, documentUri} = await getLinks(text);
      assert.ok(links);
      assert.strictEqual(links.length, 1);
      assert.deepStrictEqual(
        links[0],
        new ownersLinkProvider.OwnersLink(
          'tools/../translation/TRANSLATION_OWNERS',
          documentUri,
          new vscode.Range(0, 0, 0, text.length)
        )
      );
    });

    it(`extracts ${type} links with special characters`, async () => {
      const text = `${prefix}/styleguide/c++/OWNERS`;

      const {links, documentUri} = await getLinks(text);
      assert.ok(links);
      assert.strictEqual(links.length, 1);
      assert.deepStrictEqual(
        links[0],
        new ownersLinkProvider.OwnersLink(
          '/styleguide/c++/OWNERS',
          documentUri,
          new vscode.Range(0, 0, 0, text.length)
        )
      );
    });
  });

  it('correctly extracts the clickable range', async () => {
    const text = `\
  file:/path1
per-file foo.txt =   file:/path2
  include   /path3  # test`;
    const {links, documentUri} = await getLinks(text);
    assert.ok(links);
    assert.strictEqual(links.length, 3);
    assert.deepStrictEqual(links, [
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
      vscode.Uri.file('/document'),
      new vscode.Range(0, 0, 0, 10)
    );

    resolveLink(link);
    assert.deepStrictEqual(link.target, vscode.Uri.file('/document/foo/bar'));
  });

  it('resolves link with absolute path', async () => {
    spyOn(commonUtil, 'findGitDir').and.returnValue('/root_dir');

    const link = new ownersLinkProvider.OwnersLink(
      '/foo/bar/baz/..',
      vscode.Uri.file('/document'),
      new vscode.Range(0, 0, 0, 10)
    );

    resolveLink(link);
    assert.deepStrictEqual(link.target, vscode.Uri.file('/root_dir/foo/bar'));
  });
});
