// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as vscode from 'vscode';
import * as eclass from '../../../common/chromiumos/portage/eclass';
import * as parse from '../../../common/chromiumos/portage/parse';

export function activate(
  context: vscode.ExtensionContext,
  chromiumosRoot: string
): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      {language: 'shellscript', pattern: '**/*.{ebuild,eclass}'},
      new EbuildLinkProvider(chromiumosRoot)
    )
  );
}

const CROS_WORKON_LOCALNAME = 'CROS_WORKON_LOCALNAME';
const CROS_WORKON_SUBTREE = 'CROS_WORKON_SUBTREE';

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
    let parsedEbuild: parse.ParsedEbuild;
    try {
      parsedEbuild = parse.parseEbuildOrThrow(document.getText());
    } catch (e) {
      // Does not provide link for ebuild file failed to be parsed (e.g. edit-
      // in-progress file has open parenthesis or quotes).
      return [];
    }

    for (const parsedEclass of parsedEbuild.inherits) {
      const path = eclass.findEclassFilePath(
        parsedEclass.name,
        this.chromiumosRoot
      );
      if (path !== undefined) {
        links.push(
          ...this.createLinks(
            parsedEclass.range,
            path.substring(
              path.lastIndexOf(this.chromiumosRoot) +
                this.chromiumosRoot.length +
                1 // Trailing directory delimiter after path to CrOS root.
            )
          )
        );
      }
    }

    // Support only one (the last) localname assignment.
    // Cast string-type value to array for unified handling later.
    const localnames = parsedEbuild.getAsStringValues(CROS_WORKON_LOCALNAME);
    if (!localnames) {
      return links;
    }

    // CROS_WORKON_LOCALNAME points to file paths relative to src/ if the
    // package is in the chromeos-base category; otherwise they're relative
    // to src/third_party/.
    // TODO(b:303398643): support third_party (non chromeos-base)
    const pathsFromSrc: string[] = [];
    for (const localname of localnames) {
      // Sometimes we also need to strip leading "../"
      const path = localname.value.startsWith('../')
        ? localname.value.substring(3)
        : localname.value;
      pathsFromSrc.push(path);
      links.push(...this.createLinks(localname.range, `src/${path}`));
    }

    // Support only one (the last) subtree assignment.
    // Cast string-type value to array for unified handling later.
    const subtreesPerLocalname =
      parsedEbuild.getAsStringValues(CROS_WORKON_SUBTREE);
    if (!subtreesPerLocalname) {
      return links;
    }

    // Length of subtrees should be the same as number of localname paths.
    // Do not generate link for any of them if it does not match.
    if (subtreesPerLocalname.length !== pathsFromSrc.length) {
      return links;
    }

    for (const [subtrees, pathFromSrc] of subtreesPerLocalname.map<
      [parse.EbuildStrValue, string]
    >((x, i) => [x, pathsFromSrc[i]])) {
      let subtreeMatch: RegExpMatchArray | null;
      const dirNameRe = /[^ ]+/g;
      while ((subtreeMatch = dirNameRe.exec(subtrees.value)) !== null) {
        if (subtreeMatch.index !== undefined) {
          const subtree = subtreeMatch[0];
          const start = new vscode.Position(
            subtrees.range.start.line,
            subtrees.range.start.character + subtreeMatch.index
          );
          const end = new vscode.Position(
            start.line,
            start.character + subtree.length
          );
          const range = new vscode.Range(start, end);
          links.push(
            ...this.createLinks(range, `src/${pathFromSrc}/${subtree}`)
          );
        }
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
