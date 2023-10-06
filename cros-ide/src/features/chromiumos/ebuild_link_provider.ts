// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as vscode from 'vscode';

export function activate(
  context: vscode.ExtensionContext,
  chromiumosRoot: string
): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      {language: 'shellscript', pattern: '**/*.ebuild'},
      new EbuildLinkProvider(chromiumosRoot)
    )
  );
}

// TODO(b:303398643): support arrays in CROS_WORKON_LOCALNAME
// and CROS_WORKON_SUBTREE
// TODO(b:303398643): use the existing ebuild parser, see
// https://chromium-review.googlesource.com/c/chromiumos/chromite/+/4886419/comment/cebe74cd_f244c8e3/
const localName = 'CROS_WORKON_LOCALNAME';
const localNameRegex = new RegExp(localName + '="(.*)"');
const localNameOffset = localName.length + 2; // +2 for ="

const subtree = 'CROS_WORKON_SUBTREE';
const subtreeRegex = new RegExp(subtree + '="(.*)"');
const subtreeOffset = subtree.length + 2; // +2 for ="

const dirName = /[^ ]+/g;

/**
 * Put links on CROS_WORKON_LOCALNAME and CROS_WORKON_SUBTREE values in ebuilds.
 * They open CodeSearch and new VS Code windows.
 */
export class EbuildLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private chromiumosRoot: string) {}

  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const links: vscode.DocumentLink[] = [];

    const lnMatch = localNameRegex.exec(document.getText());
    if (!lnMatch) {
      return links;
    }

    // CROS_WORKON_LOCALNAME points to file paths relative to src/ if the
    // package is in the chromeos-base category; otherwise they're relative
    // to src/third_party/.
    // TODO(b:303398643): support third_party (non chromeos-base)
    let localName = lnMatch[1];
    // Sometimes we also need to strip leading "../"
    // TODO(b:303398643): test the logic here
    if (localName.startsWith('../')) {
      localName = localName.substring(3);
    }

    {
      const start = document.positionAt(lnMatch.index + localNameOffset);
      const end = document.positionAt(
        lnMatch.index + localNameOffset + lnMatch[1].length
      );
      const range = new vscode.Range(start, end);
      links.push(...this.createLinks(range, `src/${localName}`));
    }

    const subtreesMatch = subtreeRegex.exec(document.getText());
    if (!subtreesMatch) {
      return links;
    }

    let subtreeMatch: RegExpMatchArray | null;
    while ((subtreeMatch = dirName.exec(subtreesMatch[1])) !== null) {
      if (subtreeMatch.index !== undefined) {
        const subtree = subtreeMatch[0];
        const start = document.positionAt(
          subtreesMatch.index + subtreeOffset + subtreeMatch.index
        );
        const end = document.positionAt(
          subtreesMatch.index +
            subtreeOffset +
            subtreeMatch.index +
            subtree.length
        );
        const range = new vscode.Range(start, end);
        links.push(...this.createLinks(range, `src/${localName}/${subtree}`));
      }
    }

    return links;
  }

  private createLinks(
    range: vscode.Range,
    path: string
  ): vscode.DocumentLink[] {
    // TODO(b:303398643): support public CS and other things
    const targetCs = vscode.Uri.parse(
      `http://source.corp.google.com/h/chromium/chromiumos/codesearch/+/main:${path}`
    );
    // TODO(b:303398643): path can be a file, in which case we should open it as a file
    // TODO(b:303398643): path may not exist, in which case we shouldn't link it
    const args = [
      vscode.Uri.file(`${this.chromiumosRoot}/${path}`),
      {
        forceNewWindow: true,
      },
    ];
    const targetVSCode = vscode.Uri.parse(
      `command:vscode.openFolder?${encodeURIComponent(JSON.stringify(args))}`
    );

    const csDocumentLink = new vscode.DocumentLink(range, targetCs);
    csDocumentLink.tooltip = `Open ${path} in CodeSearch`;

    const vscodeDocumentLink = new vscode.DocumentLink(range, targetVSCode);
    vscodeDocumentLink.tooltip = `Open ${path} in New VS Code Window`;

    return [csDocumentLink, vscodeDocumentLink];
  }
}
