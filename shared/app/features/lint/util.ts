// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../common/driver_repository';

const driver = getDriver();

export function sameFile(
  documentFsPath: string,
  crosLintPath: string
): boolean {
  return (
    driver.path.basename(documentFsPath) === driver.path.basename(crosLintPath)
  );
}

// Creates Diagnostic message.
// line and startCol are both 1-based.
export function createDiagnostic(
  message: string,
  source: string,
  line: number,
  startCol?: number
): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(
      new vscode.Position(line - 1, startCol ? startCol - 1 : 0),
      new vscode.Position(line - 1, Number.MAX_VALUE)
    ),
    message,
    // TODO(b/214322467): Should these actually be errors when they block
    // repo upload?
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = source;
  return diagnostic;
}

/**
 * Parses the output from Staticcheck that cros lint uses for linting Go files. Linter for tast tests
 * uses the same format and its output can be parsed with this function as well.
 *
 * FWIW, the output of Staticcheck is constructed as in [1] by appending token.Position [2] and the
 * message.
 *
 * References: [1]
 * https://github.com/dominikh/go-tools/blob/cc140e9b3719aadd3b628b7a7b00523681c8b34d/lintcmd/format.go#L54
 * [2] https://pkg.go.dev/go/token#Position.String
 */
export function parseStaticcheckOutput(
  stdout: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  // Example:
  // src/go.chromium.org/chromiumos/graphics-utils-go/trace_profiling/cmd/analyze/analyze/graph.go:53:1: comment on exported function PlotFrameTime should be of the form "PlotFrameTime ..."
  const lineRE = /([^\s]+.go):(\d+):(\d+): (.*)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stdout)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    const startCol = Number(match[3]);
    const message = match[4];
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(
        createDiagnostic(message, 'CrOS Go lint', line, startCol)
      );
    }
  }
  return diagnostics;
}
