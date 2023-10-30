// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ShortLinkProvider} from '../../../features/short_link_provider';
import {FakeCancellationToken, FakeTextDocument} from '../../testing/fakes';

// Create vscode.TextDocument from text and run ShortLinkProvider on it.
function getLinks(text: string): vscode.ProviderResult<vscode.DocumentLink[]> {
  const textDocument = new FakeTextDocument({text});
  return new ShortLinkProvider().provideDocumentLinks(
    textDocument,
    new FakeCancellationToken()
  );
}

function link(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number,
  rawTarget: string
): vscode.DocumentLink {
  const link = new vscode.DocumentLink(
    new vscode.Range(startLine, startCharacter, endLine, endCharacter),
    vscode.Uri.parse(`http://${rawTarget}`)
  );
  link.tooltip = rawTarget;
  return link;
}

describe('Short Link Provider', () => {
  it('extracts a Buganizer link', async () => {
    const links = await getLinks('Duplicate of b/123456.');
    expect(links).toEqual([link(0, 13, 0, 21, 'b/123456')]);
  });

  it('extracts two links', async () => {
    const links = await getLinks(
      'We created b/123456 for the crash.\n' +
        'Migrated from crbug/987654 because Monorail is deprecated.'
    );

    expect(links).toEqual([
      link(0, 11, 0, 19, 'b/123456'),
      link(1, 14, 1, 26, 'crbug/987654'),
    ]);
  });

  it('extracts bugs with numbers for chromium and b', async () => {
    const links = await getLinks('TODO(chromium:123313): see also b:6527146.');

    expect(links).toEqual([
      link(0, 5, 0, 20, 'crbug/123313'),
      link(0, 32, 0, 41, 'b/6527146'),
    ]);
  });

  it('extracts teams link from a todo with ldap', async () => {
    const links = await getLinks('// TODO(hiroshi): create a chat app.');

    expect(links).toEqual([link(0, 8, 0, 15, 'teams/hiroshi')]);
  });

  it('extracts crrev and crbug links', async () => {
    const links = await getLinks(
      'TODO(crbug.com/123456) crrev/c/3406219\n' + 'crrev.com/c/3406220'
    );
    expect(links).toEqual([
      link(0, 5, 0, 21, 'crbug.com/123456'),
      link(0, 23, 0, 38, 'crrev/c/3406219'),
      link(1, 0, 1, 19, 'crrev.com/c/3406220'),
    ]);
  });

  it('handles mixed link types', async () => {
    // Test that we can extract links matching different regular expressions.
    const links = await getLinks(
      'Duplicate of b/123456.\n' +
        'TODO(sundar): fight spam\n' +
        'TODO(chromium:123456): some text'
    );
    // The order of links depends on the order in which the extractors are run,
    // so we need `arrayWithExactContents`.
    expect(links).toEqual(
      jasmine.arrayWithExactContents([
        link(0, 13, 0, 21, 'b/123456'),
        link(1, 5, 1, 11, 'teams/sundar'),
        link(2, 5, 2, 20, 'crbug/123456'),
      ])
    );
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
    expect(links).toEqual([]);
  });

  it('ignores paths', async () => {
    const links = await getLinks(
      'Text obj/somepath more text; text obj/multi/level more text'
    );
    expect(links).toEqual([]);
  });
});
