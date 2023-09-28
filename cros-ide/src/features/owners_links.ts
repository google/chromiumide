// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import {Metrics} from './metrics/metrics';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      {scheme: 'file', pattern: '**/*OWNERS'},
      new OwnersLinkProvider()
    )
  );
}

export class OwnersLink extends vscode.DocumentLink {
  constructor(
    readonly relativeOrAbsolutePath: string,
    readonly documentUri: vscode.Uri,
    range: vscode.Range
  ) {
    super(range);
  }

  resolve(): void {
    Metrics.send({
      category: 'interactive',
      group: 'owners',
      description: 'clicked file: or include link',
      name: 'owners_clicked_file_or_link',
    });

    if (this.relativeOrAbsolutePath.startsWith('/')) {
      // Resolve an "absolute" path: This assumes that all "absolute" paths are relative to the
      // nearest .git directory.
      const gitDir = commonUtil.findGitDir(this.documentUri.fsPath);
      if (!gitDir) {
        void vscode.window.showErrorMessage(
          'Unable to resolve link: No nearest .git directory found.'
        );
        return;
      }
      this.target = vscode.Uri.file(
        path.join(gitDir, this.relativeOrAbsolutePath)
      );
    } else {
      // Resolve relative paths relative to the OWNERS file.
      this.target = vscode.Uri.file(
        path.join(this.documentUri.fsPath, this.relativeOrAbsolutePath)
      );
    }
  }
}

// See this document for a detailed description of the OWNERS file format:
// https://chromium-review.googlesource.com/plugins/code-owners/Documentation/backend-find-owners.html#syntax
//
// We support two types of links: `include` and `file` links.
// 1. The `include` keyword can only appear at the start of a line. It is followed by whitespace (no
//    colon!).
// 2. The `file` keyword can appear at the start of a line, or at the end of a `per-file` line. It
//    is followed by a colon.
//
// What follows is an optional project reference to another project on the same host, followed by
// another colon. If a project reference is provided, then, optionally, a branch name and another
// colon follow. After that, the file path to the other OWNERS file follows. If the path begins with
// a slash, then the path is treated as being relative to the root of the Gerrit project. Double
// slashes are also allowed, but are superfluous. Paths that do not begin with a slash are resolved
// relative to the current OWNERS file.
//
// Note: This plugin does not currently support project references or branch names. This plugin also
// assumes that file names do not contain spaces.
//
// Lines can also end with comments that start with a `#`.
export class OwnersLinkProvider
  implements vscode.DocumentLinkProvider<OwnersLink>
{
  // This Regexp consists of three parts:
  //
  // The first part looks for:
  // - `include` at the start of the line, optionally preceded by some whitespace ("prefix1"),
  //   followed by at least one whitespace character.
  // - `file:` anywhere in the line, as long as it is not preceded by `#` (which would indicate a
  //   comment).
  //
  // The second part matches the file path itself. The third part matches whitespace, optionally
  // followed by a comment, followed by the end of the line.
  private static readonly PATTERN =
    /^(?:(?<prefix1>[^\S\r\n]*)include[^\S\r\n]+|(?<prefix2>[^\r\n#]*)file:)(?<path>[^\s:]+)(?<suffix>[^\S\r\n]*(?:#.*|))$/gm;

  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): OwnersLink[] {
    const links: OwnersLink[] = [];
    const text = document.getText();

    for (const match of text.matchAll(OwnersLinkProvider.PATTERN)) {
      if (match.index !== undefined && match.groups) {
        const prefixLength = (match.groups.prefix1 ?? match.groups.prefix2)
          .length;
        const suffixLength = match.groups.suffix.length;
        const linkStart = document.positionAt(match.index + prefixLength);
        const linkEnd = document.positionAt(
          match.index + match[0].length - suffixLength
        );

        // Replace multiple leading slashes with just a single slash.
        const relativeOrAbsolutePath = match.groups.path.replace(
          /^\/+(?=\/)/,
          ''
        );

        links.push(
          new OwnersLink(
            relativeOrAbsolutePath,
            document.uri,
            new vscode.Range(linkStart, linkEnd)
          )
        );
      }
    }
    return links;
  }

  resolveDocumentLink(
    link: OwnersLink,
    _token: vscode.CancellationToken
  ): OwnersLink {
    link.resolve();
    return link;
  }
}
