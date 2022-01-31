// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as vscode from 'vscode';

import * as crosLint from '../../cros_lint';

/* eslint max-len: ["error", { "ignoreTemplateLiterals": true }]*/

const inputFileContents =
`#ifndef CROS_DISKS_AAA_H_
#define CROS_DISKS_AAA_H_

namespace {
    int f();
}

#endif  // CROS_DISKS_AAA_H_
`;

const crosLintOutput =
`cros-disks/aaa.h:0:  No copyright message found.  You should have a line: "Copyright [year] <Copyright Owner>"  [legal/copyright] [5]
cros-disks/aaa.h:4:  Do not use unnamed namespaces in header files.  See https://google.github.io/styleguide/cppguide.html#Namespaces for more information.  [build/namespaces] [4]
Done processing cros-disks/aaa.h
Total errors found: 2
11:21:52: ERROR: Found lint errors in 1 files.
`;

/** Provides virtual documents for testing. */
class TestDocumentProvider implements vscode.TextDocumentContentProvider {
  constructor(
    readonly files : Map<string, string>,
  ) {}

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.files.get(uri.fsPath)!;
  }
}

const documentProvider = new TestDocumentProvider(new Map<string, string>([
  ['cros-disks/aaa.h', inputFileContents],
]));
const scheme = 'testing';
vscode.workspace.registerTextDocumentContentProvider(scheme, documentProvider);

suite('Cros Lint Test Suite', () => {
  test('Cpp warnings', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: 'cros-disks/aaa.h'});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const diagnostics =
      crosLint.parseCrosLintCpp(crosLintOutput, '', textDocument);
    assert.ok(diagnostics);
    assert.strictEqual(diagnostics.length, 2);
    const [copyrightWarn, namespaceWarn] = diagnostics;

    const expectedCopyrightWarn = new vscode.Diagnostic(
        new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(0, Number.MAX_VALUE),
        ),
        `No copyright message found.  You should have a line: "Copyright [year] <Copyright Owner>"`,
        vscode.DiagnosticSeverity.Warning,
    );
    assert.deepStrictEqual(expectedCopyrightWarn, copyrightWarn);

    const expectedNamespaceWarn = new vscode.Diagnostic(
        new vscode.Range(
            new vscode.Position(3, 0),
            new vscode.Position(3, Number.MAX_VALUE),
        ),
        `Do not use unnamed namespaces in header files.  See https://google.github.io/styleguide/cppguide.html#Namespaces for more information.`,
        vscode.DiagnosticSeverity.Warning,
    );
    assert.deepStrictEqual(expectedNamespaceWarn, namespaceWarn);
  });
});
