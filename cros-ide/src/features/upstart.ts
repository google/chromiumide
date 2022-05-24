// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext) {
  vscode.languages.registerDocumentSymbolProvider(
    {language: 'upstart'},
    new UpstartSymbolProvider(),
    {label: 'CrOS IDE Upstart'}
  );
}

// The regex does not allow leading spaces (they would match
// a different 'env' inside script) and multiple spaces between 'env' and
// the variable name (all platform2 conf files have one spac).
// This behavior matches how our current syntax highlighting works.
const envRE = /^env ([A-Za-z0-9_]+)(=.*)?/gm;

class UpstartSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ) {
    let match: RegExpExecArray | null;
    const symbols: vscode.DocumentSymbol[] = [];
    while ((match = envRE.exec(document.getText())) !== null) {
      const symbol = new vscode.DocumentSymbol(
        // variable name
        match[1],
        '',
        vscode.SymbolKind.Variable,
        // entire line, from env to the assigned value
        new vscode.Range(
          document.positionAt(match.index),
          document.positionAt(match.index + match[0].length)
        ),
        // just the variable name
        new vscode.Range(
          document.positionAt(match.index + 4),
          document.positionAt(match.index + 4 + match[1].length)
        )
      );
      symbols.push(symbol);
    }
    return symbols;
  }
}

export const TEST_ONLY = {UpstartSymbolProvider};
