// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {
  vscode.languages.registerDocumentSymbolProvider(
    {language: 'upstart'},
    new UpstartSymbolProvider(),
    {label: 'ChromiumIDE Upstart'}
  );
}

class UpstartSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];

    for (const extractor of extractors) {
      let match: RegExpExecArray | null;
      while ((match = extractor.regex.exec(document.getText())) !== null) {
        const symbol = new vscode.DocumentSymbol(
          extractor.name(match),
          extractor.detail(match),
          extractor.symbolKind,
          extractor.range(match, document),
          extractor.selectionRange(match, document)
        );
        symbols.push(symbol);
      }
    }

    return symbols;
  }
}

interface StanzaExtractor {
  regex: RegExp;
  symbolKind: vscode.SymbolKind;

  /** For example, 'script' or variable name. */
  name(match: RegExpExecArray): string;

  /** Modifier, for example, 'post-exec'. */
  detail(match: RegExpExecArray): string;

  /** Full range described by a symbol, for example, everything in 'script (...) end script' */
  range(match: RegExpExecArray, document: vscode.TextDocument): vscode.Range;

  /** Smaller range where a symbol is located. */
  selectionRange(
    match: RegExpExecArray,
    document: vscode.TextDocument
  ): vscode.Range;
}

function groupRange(
  match: RegExpExecArray,
  document: vscode.TextDocument,
  group: number,
  offset?: number
): vscode.Range {
  return new vscode.Range(
    document.positionAt(match.index + (offset ?? 0)),
    document.positionAt(match.index + (offset ?? 0) + match[group].length)
  );
}

const extractors: StanzaExtractor[] = [
  // env
  {
    // The regex does not allow leading spaces (they would match
    // a different 'env' inside script) and multiple spaces between 'env' and
    // the variable name (all platform2 conf files have one space).
    // This behavior matches how our current syntax highlighting works.
    regex: /^env ([A-Za-z0-9_]+)(=.*)?/gm,
    symbolKind: vscode.SymbolKind.Variable,
    name(match: RegExpExecArray) {
      return match[1];
    },
    detail(_match: RegExpExecArray) {
      return '';
    },
    range(match: RegExpExecArray, document: vscode.TextDocument) {
      // entire line, from env to the assigned value
      return groupRange(match, document, 0);
    },
    selectionRange(match: RegExpExecArray, document: vscode.TextDocument) {
      // just the variable name
      return groupRange(match, document, 1, 4);
    },
  },
  // script
  {
    // We need .*? instead of .* to avoid greedy matches,
    // which would merge all scripts into one.
    regex:
      /^((pre-start |post-start |pre-stop |post-stop )?script).*?\nend script/gms,
    symbolKind: vscode.SymbolKind.Function,
    name(_match: RegExpExecArray) {
      return 'script';
    },
    detail(match: RegExpExecArray) {
      return match[2] ? match[2].trim() : '';
    },
    range(match: RegExpExecArray, document: vscode.TextDocument) {
      return groupRange(match, document, 0);
    },
    selectionRange(match: RegExpExecArray, document: vscode.TextDocument) {
      return groupRange(match, document, 1);
    },
  },
  // exec
  {
    regex: /^((pre-start |post-start |pre-stop |post-stop )?exec).*?[^\\]$/gms,
    symbolKind: vscode.SymbolKind.Function,
    name(_match: RegExpExecArray) {
      return 'exec';
    },
    detail(match: RegExpExecArray) {
      return match[2] ? match[2].trim() : '';
    },
    range(match: RegExpExecArray, document: vscode.TextDocument) {
      return groupRange(match, document, 0);
    },
    selectionRange(match: RegExpExecArray, document: vscode.TextDocument) {
      return groupRange(match, document, 1);
    },
  },
];

export const TEST_ONLY = {UpstartSymbolProvider};
