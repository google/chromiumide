// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      vscode.languages.registerDocumentLinkProvider(
          '*',
          new ShortLinkProvider()));
}

/**
 * Tell VS Code that things like go/example, crbug/123456 are links.
 *
 * We also support bugs referenced with chromium:xxxxxx and b:xxxxxx,
 * as well as ldaps in todos, which link to the teams page.
 */
export class ShortLinkProvider implements vscode.DocumentLinkProvider {
  public provideDocumentLinks(
      document: vscode.TextDocument, token: vscode.CancellationToken)
    : vscode.ProviderResult<vscode.DocumentLink[]> {
    // TODO(b/216429126): add caching
    return this.extractLinks(document, shortLinkPattern, shortLinkUri)
        .concat(
            this.extractLinks(document, trackerBugPattern, trackerBugUri),
            this.extractLinks(document, todoLdapPattern, todoLdapUri));
  }

  private extractLinks(
      document: vscode.TextDocument,
      pattern : RegExp,
      generateUri: (match: RegExpMatchArray) => vscode.Uri,
  ) : vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    let match: RegExpMatchArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // TODO(b/216429126): check when match.index can be undefined
      if (match.index) {
        const linkStart = document.positionAt(match.index);
        const linkEnd = document.positionAt((match.index) + match[0].length);
        links.push(new vscode.DocumentLink(
            new vscode.Range(linkStart, linkEnd),
            generateUri(match)));
      }
    }
    return links;
  }
}

// Keep regular expression in one line to work around Gerrit syntax
// highlighting bug.
/* eslint max-len: ["error", { "ignoreRegExpLiterals": true }]*/

// Matches bugs references with chromium:xxxxxx and b:xxxxxx.
// We start with lookahead for spaces, '(' and line start to avoid mathichg
// things like MAC adderesses.
//
// For simplicity, we do not match #fragment, so b:123#comment3, will only
// match b:123. Note that b/123#comment3 will work via the other pattern though.
const trackerBugPattern = /(?<=^|\s|\()(b|chromium):([0-9]+)/g;

// Extract the uri from matches to trackerBugPattern.
function trackerBugUri(match: RegExpMatchArray): vscode.Uri {
  let tracker = match[1];
  if (tracker === 'chromium') {
    tracker = 'crbug';
  }
  const id = match[2];
  return vscode.Uri.parse(`http://${tracker}/${id}`);
}

// Matches ldaps in todos. Lookahead and lookbehind are used to restrict
// the match to the ldap.
const todoLdapPattern = /(?<=TODO\()([a-z]+)(?=\))/g;

// Extract the uri from matches to todoLdapPattern.
function todoLdapUri(match: RegExpMatchArray): vscode.Uri {
  const ldap = match[1];
  return vscode.Uri.parse(`http://teams/${ldap}`);
}

// Match (up-to-5-letters)[.com]/(path). There are two capturing groups:
//   - host (for example, crbug), it may include '.com'
//   - url (for example, 123456)
// For robustness, the regex starts with a lookbehind matching one of:
//  - start of line
//  - whitespace
//  - match to '(', because links are often used in "TODO(link)"
const shortLinkPattern = /(?<=^|\s|\()\b([a-z]{1,5}(?:\.com)?)\/([^)\s.,;'\"]+)/g;

// Extract the uri from matches to shortLinkPattern.
function shortLinkUri(match: RegExpMatchArray): vscode.Uri {
  const host = match[1];
  const path = match[2];
  return vscode.Uri.parse(`http://${host}/${path}`);
}
