// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

// Matches with file paths that expectedly represent files under src/.
// - It should start with one or more "../" without a leading slash or two slashes.
// - It can be optionally followed by a line number and a column number (1-based).
const SRC_RE =
  /((?:^|[^/])(?:\.\.\/)+|(?:^|[^:])\/\/)(([^ \t:]+)(?::(\d+))?(?::(\d+))?)/g;

// Matches with file paths that start with gen/.
// 1=prefix, 2=gen/, 3=4:5:6, 4=path, 5=line, 6=column
const GEN_RE = /(^|(?=\W)[^/])(gen\/)(([\w/.]+)(?::(\d+))?(?::(\d+))?)/g;

export class ChromiumTerminalLink implements vscode.TerminalLink {
  constructor(
    readonly startIndex: number,
    readonly length: number,
    readonly uri: vscode.Uri,
    readonly position: vscode.Position | undefined
  ) {}
}

async function statNoThrow(file: string): Promise<fs.Stats | undefined> {
  try {
    return await fs.promises.stat(file);
  } catch (e) {
    return undefined;
  }
}

/**
 * Generates links for file paths relative to the output directory.
 */
export class ChromiumTerminalLinkProvider
  implements vscode.TerminalLinkProvider
{
  constructor(private readonly srcDir: string) {}

  async provideTerminalLinks(
    context: vscode.TerminalLinkContext,
    _token: vscode.CancellationToken
  ): Promise<ChromiumTerminalLink[]> {
    const toPosition = (line?: number, column?: number) =>
      line !== undefined && column !== undefined
        ? new vscode.Position(line - 1, column - 1)
        : line !== undefined
        ? new vscode.Position(line - 1, 0)
        : undefined;

    return [
      ...[...context.line.matchAll(SRC_RE)].map(match => {
        const startIndex = match.index! + match[1].length;
        const length = match[2].length;
        const uri = vscode.Uri.file(path.join(this.srcDir, match[3]));
        const line = Number(match[4]) || undefined;
        const column = Number(match[5]) || undefined;
        const position = toPosition(line, column);
        return new ChromiumTerminalLink(startIndex, length, uri, position);
      }),
      ...(await Promise.all(
        [...context.line.matchAll(GEN_RE)].map(async match => {
          // 1=prefix, 2=gen/, 3=4:5:6, 4=path, 5=line, 6=column
          const pathFromGen = match[4];
          const line = Number(match[5]) || undefined;
          const column = Number(match[6]) || undefined;
          const position = toPosition(line, column);
          const srcFilePath = path.join(this.srcDir, pathFromGen);
          // Sometimes files are just copied from source dir.
          if (await statNoThrow(srcFilePath)) {
            const startIndex = match.index! + match[1].length + match[2].length;
            const length = match[3].length;
            const uri = vscode.Uri.file(srcFilePath);
            return new ChromiumTerminalLink(startIndex, length, uri, position);
          }
          const startIndex = match.index! + match[1].length;
          const length = match[2].length + match[3].length;
          const currentLinkGen = path.join(this.srcDir, 'out/current_link/gen');
          const uri = vscode.Uri.file(path.join(currentLinkGen, pathFromGen));
          return new ChromiumTerminalLink(startIndex, length, uri, position);
        })
      )),
    ];
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
