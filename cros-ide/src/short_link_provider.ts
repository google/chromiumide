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
 */
class ShortLinkProvider implements vscode.DocumentLinkProvider {
  // Match (up-to-5-letters)/(path). There are two capturing groups:
  //   - host (for example, crbug)
  //   - url (for example, 123456)
  // For robustness, the regex starts with a lookbehind matching one of:
  //  - start of line
  //  - whitespace
  //  - match to '(', because links are often used in "TODO(link)"
  private readonly linkPattern =
      /(?<=^|\s|\()\b([a-z]{1,5})\/([^)\s.,;'\"]+)/g;

  public provideDocumentLinks(
    document: vscode.TextDocument, token: vscode.CancellationToken)
    : vscode.ProviderResult<vscode.DocumentLink[]> {
    // TODO(b/216429126): add caching
    return this.analyzeDocument(document);
  }

  // TODO(b/216429126): add unit tests
  private analyzeDocument(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    let match: RegExpMatchArray | null;
    while ((match = this.linkPattern.exec(text)) !== null) {
      const host = match[1];
      const path = match[2];
      // TODO(b/216429126): check when match.index can be undefined
      if (match.index) {
        const linkStart = document.positionAt(match.index);
        const linkEnd = document.positionAt((match.index) + match[0].length);
        links.push(new vscode.DocumentLink(
          new vscode.Range(linkStart, linkEnd),
          vscode.Uri.parse(`http://${host}/${path}`)));
      }
    }
    return links;
  }
}
