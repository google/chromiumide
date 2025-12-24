// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider('*', new ShortLinkProvider())
  );
}

/**
 * Tell VS Code that things like go/example, crbug/123456 are links.
 *
 * We also support bugs referenced with chromium:xxxxxx and b:xxxxxx,
 * as well as ldaps in todos, which link to the teams page.
 */
export class ShortLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    // TODO(b/216429126): add caching
    return this.extractLinks(document, shortLinkPattern, shortLink).concat(
      this.extractLinks(document, trackerBugPattern, trackerBugLink),
      this.extractLinks(document, todoLdapPattern, todoLdapLink)
    );
  }

  private extractLinks(
    document: vscode.TextDocument,
    pattern: RegExp,
    generateLink: (
      match: RegExpMatchArray,
      range: vscode.Range
    ) => vscode.DocumentLink
  ): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    let match: RegExpMatchArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index !== undefined) {
        const linkStart = document.positionAt(match.index);
        const linkEnd = document.positionAt(match.index + match[0].length);
        const range = new vscode.Range(linkStart, linkEnd);
        links.push(generateLink(match, range));
      }
    }
    return links;
  }
}

// Keep regular expression in one line to work around Gerrit syntax
// highlighting bug.

// Matches bugs references with chromium:xxxxxx and b:xxxxxx.
// We start with lookahead for spaces, '(' and line start to avoid matching
// things like MAC addresses.
//
// For simplicity, we do not match #fragment, so b:123#comment3, will only
// match b:123. Note that b/123#comment3 will work via the other pattern though.
const trackerBugPattern = /(?<=^|\s|\()(b|chromium):([0-9]+)/g;

/** Create a link from matches to trackerBugPattern. */
function trackerBugLink(
  match: RegExpMatchArray,
  range: vscode.Range
): vscode.DocumentLink {
  let tracker = match[1];
  if (tracker === 'chromium') {
    tracker = 'crbug';
  }
  const id = match[2];
  const docLink = new vscode.DocumentLink(
    range,
    vscode.Uri.parse(`http://${tracker}/${id}`)
  );
  docLink.tooltip = `${tracker}/${id}`;
  return docLink;
}

// Matches ldaps in todos. Lookahead and lookbehind are used to restrict
// the match to the ldap.
const todoLdapPattern = /(?<=TODO\()([a-z]+)(?=\))/g;

/** Create a link from matches to todoLdapPattern. */
function todoLdapLink(
  match: RegExpMatchArray,
  range: vscode.Range
): vscode.DocumentLink {
  const ldap = match[1];
  const docLink = new vscode.DocumentLink(
    range,
    vscode.Uri.parse(`http://teams/${ldap}`)
  );
  docLink.tooltip = `teams/${ldap}`;
  return docLink;
}

// Match link.com/path and (b|go|crrrev|...)/path. There are two capturing groups:
//   - host (for example, crbug, crbug.com),
//   - url (for example, 123456)
// For robustness, the regex starts with a lookbehind matching one of:
//  - start of line
//  - whitespace
//  - match to '(', because links are often used in "TODO(link)"
// In order to avoid matching things like `obj/path`, we require that the host either
// ends in `.com` or it is a known short links.
const shortLinkPattern =
  /(?<=^|\s|\()\b([a-z]+\.com|b|go|crbug|crrev)\/([^)\s.,;'"]+)/g;

/** Create a link from matches to shortLinkPattern. */
function shortLink(
  match: RegExpMatchArray,
  range: vscode.Range
): vscode.DocumentLink {
  const host = match[1];
  const path = match[2];
  vscode.Uri.parse(`http://${host}/${path}`);
  const docLink = new vscode.DocumentLink(
    range,
    vscode.Uri.parse(`http://${host}/${path}`)
  );
  docLink.tooltip = `${host}/${path}`;
  return docLink;
}
