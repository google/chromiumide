// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as childProcess from 'child_process';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const collection = vscode.languages.createDiagnosticCollection('cros-lint');
  if (vscode.window.activeTextEditor) {
    updateCrosLintDiagnostics(
        vscode.window.activeTextEditor.document, collection);
  }
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(
      editor => {
        if (editor) {
          updateCrosLintDiagnostics(editor.document, collection);
        }
      }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(
      document => {
        updateCrosLintDiagnostics(document, collection);
      }));
}

// Describes how to run a linter and parse its output.
interface LintConfig {
  command(path: string) : string;
  parse(stdout: string, stderr: string, document: vscode.TextDocument)
      : vscode.Diagnostic[];
}

// Don't forget to update package.json when adding more languages.
const lintConfigs = new Map<string, LintConfig>()
    .set(
        'cpp',
        {
          command: (path: string) => `cros lint ${path}`,
          parse: parseCrosLintCpp,
        })
    .set(
        'python',
        {
          command: (path: string) => `cros lint ${path}`,
          parse: parseCrosLintShellPython,
        })
    .set(
        'shellscript',
        {
          command: (path: string) => `cros lint --output=parseable ${path}`,
          parse: parseCrosLintShellPython,
        });

function updateCrosLintDiagnostics(
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection): void {
  if (document && document.uri.scheme === 'file') {
    const lintConfig = lintConfigs.get(document.languageId);
    if (lintConfig) {
      childProcess.exec(lintConfig.command(document.uri.fsPath),
          (_error, stdout, stderr) => {
            const diagnostics = lintConfig.parse(stdout, stderr, document);
            collection.set(document.uri, diagnostics);
          });
    }
  } else {
    collection.clear();
  }
}

export function parseCrosLintCpp(
    stdout: string, stderr: string, document: vscode.TextDocument)
  :vscode.Diagnostic[] {
  const lineRE = /^([^ \n]+):([0-9]+):  (.*)  \[([^ ]+)\] \[([1-5])\]/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  // stdout and stderr are merged, because we saw that warnings can go to
  // either.
  // TODO(b/214322467): Figure out when we should use stderr and when stdout.
  while ((match = lineRE.exec(stdout + '\n' + stderr)) !== null) {
    const file = match[1];
    let line = Number(match[2]);
    // Warning about missing copyright is reported at hard coded line 0.
    // This seems like a bug in cpplint.py, which otherwise uses 1-based
    // line numbers.
    if (line === 0) {
      line = 1;
    }
    const message = match[3];
    if (file === document.uri.fsPath) {
      diagnostics.push(createDiagnostic(message, line));
    }
  }
  return diagnostics;
}

// Parse output from cros lint on Python files
// or cros lint --output=parseable on shell files.
// TODO(b/214322467): Add unit tests for Python and shell.
export function parseCrosLintShellPython(
    stdout: string, _stderr: string, document: vscode.TextDocument)
  : vscode.Diagnostic[] {
  const lineRE = /^([^ \n\:]+):([0-9]+):([0-9]+): (.*)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stdout)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    const startCol = Number(match[3]);
    const message = match[4];
    if (file === document.uri.fsPath) {
      diagnostics.push(createDiagnostic(message, line, startCol));
    }
  }
  return diagnostics;
}

function createDiagnostic(message : string, line: number, startCol?: number)
  : vscode.Diagnostic {
  return new vscode.Diagnostic(
      new vscode.Range(
          new vscode.Position(line - 1, startCol ? startCol : 0),
          new vscode.Position(line - 1, Number.MAX_VALUE),
      ),
      message,
      // TODO(b/214322467): Should these actually be errors when they block
      // repo upload?
      vscode.DiagnosticSeverity.Warning,
  );
}
