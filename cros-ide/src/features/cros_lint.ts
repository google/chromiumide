// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import * as ideUtilities from '../ide_utilities';
import * as bgTaskStatus from '../ui/bg_task_status';

export function activate(context: vscode.ExtensionContext,
    statusManager: bgTaskStatus.StatusManager) {
  const collection = vscode.languages.createDiagnosticCollection('cros-lint');
  if (vscode.window.activeTextEditor) {
    updateCrosLintDiagnostics(
        vscode.window.activeTextEditor.document, collection, statusManager);
  }
  // TODO(ttylenda): Add integration test to verify that we run linters on events.
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(
      document => {
        updateCrosLintDiagnostics(document, collection, statusManager);
      }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(
      document => {
        updateCrosLintDiagnostics(document, collection, statusManager);
      }));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(
      document => {
        collection.delete(document.uri);
      }));
}

/** Describes how to run a linter and parse its output. */
interface LintConfig {
  executable: string;
  arguments(path: string) : string[];
  parse(stdout: string, stderr: string, document: vscode.TextDocument)
      : vscode.Diagnostic[];
}

const GNLINT_PATH = '~/chromiumos/src/platform2/common-mk/gnlint.py';

// Don't forget to update package.json when adding more languages.
const lintConfigs = new Map<string, LintConfig>([
  ['cpp', {
    executable: 'cros',
    arguments: (path: string) => ['lint', path],
    parse: parseCrosLintCpp,
  }],
  ['gn', {
    executable: GNLINT_PATH,
    arguments: (path: string) => [path],
    parse: parseCrosLintGn,
  }],
  ['python', {
    executable: 'cros',
    arguments: (path: string) => ['lint', path],
    parse: parseCrosLintPython,
  }],
  ['shellscript', {
    executable: 'cros',
    arguments: (path: string) => ['lint', '--output=parseable', path],
    parse: parseCrosLintShell,
  }],
]);

const LINTER_TASK_ID = 'Linter';

async function updateCrosLintDiagnostics(
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection,
    statusManager: bgTaskStatus.StatusManager): Promise<void> {
  if (document && document.uri.scheme === 'file') {
    const lintConfig = lintConfigs.get(document.languageId);
    if (lintConfig) {
      const res = await commonUtil.exec(
          lintConfig.executable, lintConfig.arguments(document.uri.fsPath),
          ideUtilities.getLogger().append,
          {ignoreNonZeroExit: true, logStdout: true});
      if (res instanceof Error) {
        ideUtilities.getLogger().append(res.message),
        statusManager.setTask(LINTER_TASK_ID, bgTaskStatus.TaskStatus.ERROR);
        return;
      }
      const {stdout, stderr} = res;
      const diagnostics = lintConfig.parse(stdout, stderr, document);
      collection.set(document.uri, diagnostics);
      statusManager.setTask(LINTER_TASK_ID, bgTaskStatus.TaskStatus.OK);
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

// Parse output from platform2/common-mk/gnlint.py on a GN file.
export function parseCrosLintGn(_stdout: string, stderr: string, document: vscode.TextDocument)
: vscode.Diagnostic[] {
  // Only the errors that have location in the file are captured.
  // There are two categories of errors without line/column number:
  // - file not formatted by gn-format: should do auto-format upon save
  // - wrong commandline arguments: should be covered by extension unit test
  // So these are ignored.
  const lineRE = /ERROR: ([^ \n\:]+):([0-9]+):([0-9]+): (.*)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stderr)) !== null) {
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

// Parse output from cros lint on Python files
export function parseCrosLintPython(
    stdout: string, _stderr: string, document: vscode.TextDocument)
  : vscode.Diagnostic[] {
  const lineRE = /^([^ \n\:]+):([0-9]+):([0-9]+): (.*)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stdout)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    // Column number from the python linter is 0-based.
    const startCol = Number(match[3]) + 1;
    const message = match[4];
    if (file === document.uri.fsPath) {
      diagnostics.push(createDiagnostic(message, line, startCol));
    }
  }
  return diagnostics;
}

// Parse output from cros lint --output=parseable on shell files.
export function parseCrosLintShell(
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

// Creates Diagnostic message.
// line and startCol are both 1-based.
function createDiagnostic(message : string, line: number, startCol?: number)
  : vscode.Diagnostic {
  return new vscode.Diagnostic(
      new vscode.Range(
          new vscode.Position(line - 1, startCol ? startCol - 1 : 0),
          new vscode.Position(line - 1, Number.MAX_VALUE),
      ),
      message,
      // TODO(b/214322467): Should these actually be errors when they block
      // repo upload?
      vscode.DiagnosticSeverity.Warning,
  );
}
