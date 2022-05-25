// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as crosLint from '../../features/cros_lint';
import * as testing from '../testing';

const cppFileName = 'cros-disks/aaa.h';

const cppFileContents = `#ifndef CROS_DISKS_AAA_H_
#define CROS_DISKS_AAA_H_

namespace {
    int f();
}

#endif  // CROS_DISKS_AAA_H_
`;

const cppLintOutput = `cros-disks/aaa.h:0:  No copyright message found.  You should have a line: "Copyright [year] <Copyright Owner>"  [legal/copyright] [5]
cros-disks/aaa.h:4:  Do not use unnamed namespaces in header files.  See https://google.github.io/styleguide/cppguide.html#Namespaces for more information.  [build/namespaces] [4]
Done processing cros-disks/aaa.h
Total errors found: 2
11:21:52: ERROR: Found lint errors in 1 files.
`;

const pythonFileName = 'cros-disks/aaa.py';

const pythonFileContents = `#!/usr/bin/env python3

class Foo:
    pass


def f():
    abc = 1
`;

const pythonLintOutput = `************ Module aaa
cros-disks/aaa.py:1:0: C9001: Modules should have docstrings (even a one liner) (module-missing-docstring)
cros-disks/aaa.py:3:0: C9002: Classes should have docstrings (even a one liner) (class-missing-docstring)
cros-disks/aaa.py:8:4: W0612: Unused variable 'abc' (unused-variable)
`;

const shellFileName = 'cros-disks/aaa.sh';

const shellFileContents = `#!/bin/bash

echo $1
`;

const shellLintOutput = `cros-disks/aaa.sh:3:6: note: Double quote to prevent globbing and word splitting. [SC2086]
`;

const gnFileName = 'example/BUILD.gn';

const gnFileContents = `executable("my_exec") {
  ldflags = [ "-lm" ]
  sources = [ "main.cc" ]
}
`;

const gnLintOutput = `12:34:56.789: ERROR: **** example/BUILD.gn: found 3 issue(s)
12:34:56.789: ERROR: CheckFormat: Needs reformatting. Run following command: /your_workdir/src/platform2/common-mk/../../../chroot/usr/bin/gn format example/BUILD.gn
12:34:56.789: ERROR: example/BUILD.gn:2:15: GnLintLibFlags: Libraries should be specified by "libs", not -l flags in "ldflags": -lm
12:34:56.789: ERROR: example/BUILD.gn:3:3: GnLintOrderingWithinTarget: wrong parameter order in executable(my_exec): put parameters in the following order: output_name/visibility/testonly, sources, other parameters, public_deps and deps
12:34:56.789: ERROR: 1 file(s) failed linting
`;

/** Provides virtual documents for testing. */
class TestDocumentProvider implements vscode.TextDocumentContentProvider {
  constructor(readonly files: Map<string, string>) {}

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.files.get(uri.fsPath)!;
  }
}

const documentProvider = new TestDocumentProvider(
  new Map<string, string>([
    [cppFileName, cppFileContents],
    [pythonFileName, pythonFileContents],
    [shellFileName, shellFileContents],
    [gnFileName, gnFileContents],
  ])
);
const scheme = 'testing';
vscode.workspace.registerTextDocumentContentProvider(scheme, documentProvider);

describe('Lint Integration', () => {
  it('parses C++ errors', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: cppFileName});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseCrosLintCpp(cppLintOutput, '', textDocument);
    await testing.closeDocument(textDocument);
    assert.strictEqual(actual.length, 2);
    const expected = [
      new vscode.Diagnostic(
        new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, Number.MAX_VALUE)
        ),
        'No copyright message found.  You should have a line: "Copyright [year] <Copyright Owner>"',
        vscode.DiagnosticSeverity.Warning
      ),
      new vscode.Diagnostic(
        new vscode.Range(
          new vscode.Position(3, 0),
          new vscode.Position(3, Number.MAX_VALUE)
        ),
        'Do not use unnamed namespaces in header files.  See https://google.github.io/styleguide/cppguide.html#Namespaces for more information.',
        vscode.DiagnosticSeverity.Warning
      ),
    ];
    assert.deepStrictEqual(expected, actual);
  });

  it('parses Python errors', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: pythonFileName});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseCrosLintPython(
      pythonLintOutput,
      '',
      textDocument
    );
    await testing.closeDocument(textDocument);
    assert.strictEqual(actual.length, 3);
    const expected = [
      new vscode.Diagnostic(
        new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, Number.MAX_VALUE)
        ),
        'C9001: Modules should have docstrings (even a one liner) (module-missing-docstring)',
        vscode.DiagnosticSeverity.Warning
      ),
      new vscode.Diagnostic(
        new vscode.Range(
          new vscode.Position(2, 0),
          new vscode.Position(2, Number.MAX_VALUE)
        ),
        'C9002: Classes should have docstrings (even a one liner) (class-missing-docstring)',
        vscode.DiagnosticSeverity.Warning
      ),
      new vscode.Diagnostic(
        new vscode.Range(
          new vscode.Position(7, 4),
          new vscode.Position(7, Number.MAX_VALUE)
        ),
        "W0612: Unused variable 'abc' (unused-variable)",
        vscode.DiagnosticSeverity.Warning
      ),
    ];
    assert.deepStrictEqual(expected, actual);
  });

  it('parses shell errors', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: shellFileName});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseCrosLintShell(
      shellLintOutput,
      '',
      textDocument
    );
    await testing.closeDocument(textDocument);
    assert.strictEqual(actual.length, 1);
    const expected = [
      new vscode.Diagnostic(
        new vscode.Range(
          new vscode.Position(2, 5),
          new vscode.Position(2, Number.MAX_VALUE)
        ),
        'note: Double quote to prevent globbing and word splitting. [SC2086]',
        vscode.DiagnosticSeverity.Warning
      ),
    ];
    assert.deepStrictEqual(actual, expected);
  });

  it('parses GN errors', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: gnFileName});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseCrosLintGn('', gnLintOutput, textDocument);
    assert.strictEqual(actual.length, 2);
    await testing.closeDocument(textDocument);
    const expected = [
      new vscode.Diagnostic(
        new vscode.Range(
          new vscode.Position(1, 14),
          new vscode.Position(1, Number.MAX_VALUE)
        ),
        'GnLintLibFlags: Libraries should be specified by "libs", not -l flags in "ldflags": -lm',
        vscode.DiagnosticSeverity.Warning
      ),
      new vscode.Diagnostic(
        new vscode.Range(
          new vscode.Position(2, 2),
          new vscode.Position(2, Number.MAX_VALUE)
        ),
        'GnLintOrderingWithinTarget: wrong parameter order in executable(my_exec): put parameters in the following order: output_name/visibility/testonly, sources, other parameters, public_deps and deps',
        vscode.DiagnosticSeverity.Warning
      ),
    ];
    assert.deepStrictEqual(expected, actual);
  });
});
