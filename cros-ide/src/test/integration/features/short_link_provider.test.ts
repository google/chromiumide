// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import assert from 'assert';
import * as vscode from 'vscode';
import * as shortLinkProvider from '../../../features/short_link_provider';
import {FakeCancellationToken} from '../../testing/fakes';
import * as extensionTesting from '../extension_testing';

// Create vscode.TextDocument from text and run ShortLinkProvider on it.
async function getLinks(text: string) {
  const document = await vscode.workspace.openTextDocument({content: text});
  const provider = new shortLinkProvider.ShortLinkProvider();
  const res = provider.provideDocumentLinks(
    document,
    new FakeCancellationToken()
  );
  await extensionTesting.closeDocument(document);
  return res;
}

describe('Short Link Provider', () => {
  it('extracts a Buganizer link', async () => {
    const links = await getLinks('Duplicate of b/123456.');
    assert.ok(links);
    assert.strictEqual(links.length, 1);
    const link = links[0];
    assert.deepStrictEqual(link.target, vscode.Uri.parse('http://b/123456'));
    const expectedRange = new vscode.Range(
      new vscode.Position(0, 13),
      new vscode.Position(0, 21)
    );
    assert.deepStrictEqual(link.range, expectedRange);
  });

  it('extracts two links', async () => {
    const links = await getLinks(
      'We created b/123456 for the crash.\n' +
        'Migrated from crbug/987654 because Monorail is deprecated.'
    );

    assert.ok(links);
    assert.strictEqual(links.length, 2);
    const [b, crbug] = links;

    assert.deepStrictEqual(b.target, vscode.Uri.parse('http://b/123456'));
    const expectedBRange = new vscode.Range(
      new vscode.Position(0, 11),
      new vscode.Position(0, 19)
    );
    assert.deepStrictEqual(b.range, expectedBRange);

    assert.deepStrictEqual(
      crbug.target,
      vscode.Uri.parse('http://crbug/987654')
    );
    const expectedCrbugRange = new vscode.Range(
      new vscode.Position(1, 14),
      new vscode.Position(1, 26)
    );
    assert.deepStrictEqual(crbug.range, expectedCrbugRange);
  });

  it('extracts bugs with numbers for chromium and b', async () => {
    const links = await getLinks('TODO(chromium:123313): see also b:6527146.');
    assert.ok(links);
    assert.strictEqual(links.length, 2);
    const expectedLinks = [
      new vscode.DocumentLink(
        new vscode.Range(new vscode.Position(0, 5), new vscode.Position(0, 20)),
        vscode.Uri.parse('http://crbug/123313')
      ),
      new vscode.DocumentLink(
        new vscode.Range(
          new vscode.Position(0, 32),
          new vscode.Position(0, 41)
        ),
        vscode.Uri.parse('http://b/6527146')
      ),
    ];
    assert.deepStrictEqual(links, expectedLinks);
  });

  it('extracts teams link from a todo with ldap', async () => {
    const links = await getLinks('// TODO(hiroshi): create a chat app.');
    assert.ok(links);
    assert.strictEqual(links.length, 1);
    const expectedLinks = [
      new vscode.DocumentLink(
        new vscode.Range(new vscode.Position(0, 8), new vscode.Position(0, 15)),
        vscode.Uri.parse('http://teams/hiroshi')
      ),
    ];
    assert.deepStrictEqual(links, expectedLinks);
  });

  it('extracts crrev and crbug links', async () => {
    const links = await getLinks(
      'TODO(crbug.com/123456) crrev/c/3406219\n' + 'crrev.com/c/3406220'
    );
    assert.ok(links);
    assert.strictEqual(links.length, 3);
    const expectedLinks = [
      new vscode.DocumentLink(
        new vscode.Range(new vscode.Position(0, 5), new vscode.Position(0, 21)),
        vscode.Uri.parse('http://crbug.com/123456')
      ),
      new vscode.DocumentLink(
        new vscode.Range(
          new vscode.Position(0, 23),
          new vscode.Position(0, 38)
        ),
        vscode.Uri.parse('http://crrev/c/3406219')
      ),
      new vscode.DocumentLink(
        new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 19)),
        vscode.Uri.parse('http://crrev.com/c/3406220')
      ),
    ];
    assert.deepStrictEqual(links, expectedLinks);
  });

  it('handles mixed link types', async () => {
    // Test that we can extract links matching different regular expressions.
    const links = await getLinks(
      'Duplicate of b/123456.\n' +
        'TODO(sundar): fight spam\n' +
        'TODO(chromium:123456): some text'
    );
    assert.ok(links);
    // Verify only the number of results. The order of links depends on
    // the order in which the extractors are run, so verifying an array would
    // make the test fragile.
    assert.strictEqual(links.length, 3);
  });

  it('ignores negative examples', async () => {
    // Note, that VS Code provides links for things starting with http[s],
    // so we should ignore such links.
    const links = await getLinks(
      'Text http://www.bing.com/ more text\n' +
        'TODO(http://b/123456)\n' +
        'Text http://crrev/c/123456 more text\n' +
        'Text http://crbug/123456 more text\n' +
        'Text usb:1234556 more text\n' +
        'Text 70:88:6b:92:34:70 more text'
    );
    assert.ok(links);
    assert.deepStrictEqual(links, []);
  });

  it('ignores paths', async () => {
    const links = await getLinks(
      'Text obj/somepath more text; text obj/multi/level more text'
    );
    assert.ok(links);
    assert.deepStrictEqual(links, []);
  });
});
