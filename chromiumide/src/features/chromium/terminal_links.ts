// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';

// Matches with file paths relative to the output directory.
// - It should start with one or more "../" without a leading slash.
// - It can be optionally followed by a line number and a column number (1-based).
const LINK_RE = /((?:^|[^/])(?:\.\.\/)+)(([^ \t:]+)(?::(\d+))?(?::(\d+))?)/g;

export class ChromiumTerminalLink implements vscode.TerminalLink {
  constructor(
    readonly startIndex: number,
    readonly length: number,
    readonly uri: vscode.Uri,
    readonly position: vscode.Position | undefined
  ) {}
}

/**
 * Generates links for file paths relative to the output directory.
 */
export class ChromiumTerminalLinkProvider
  implements vscode.TerminalLinkProvider
{
  constructor(private readonly srcDir: string) {}

  provideTerminalLinks(
    context: vscode.TerminalLinkContext,
    _token: vscode.CancellationToken
  ): ChromiumTerminalLink[] {
    return [...context.line.matchAll(LINK_RE)].map(match => {
      const startIndex = match.index! + match[1].length;
      const length = match[2].length;
      const uri = vscode.Uri.file(path.join(this.srcDir, match[3]));
      const line = Number(match[4]) || undefined;
      const column = Number(match[5]) || undefined;
      const position =
        line !== undefined && column !== undefined
          ? new vscode.Position(line - 1, column - 1)
          : line !== undefined
          ? new vscode.Position(line - 1, 0)
          : undefined;
      return new ChromiumTerminalLink(startIndex, length, uri, position);
    });
  }

  handleTerminalLink(link: ChromiumTerminalLink): Thenable<void> {
    const range = link.position
      ? new vscode.Range(link.position, link.position)
      : undefined;
    return vscode.commands.executeCommand('vscode.open', link.uri, {
      selection: range,
    } as vscode.TextDocumentShowOptions);
  }
}

export function activate(
  context: vscode.ExtensionContext,
  srcDir: string
): void {
  context.subscriptions.push(
    vscode.window.registerTerminalLinkProvider(
      new ChromiumTerminalLinkProvider(srcDir)
    )
  );
}
