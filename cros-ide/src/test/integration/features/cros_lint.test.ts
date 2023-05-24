// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as crosLint from '../../../features/cros_lint';
import * as extensionTesting from '../extension_testing';

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

const libchromeFileName = 'cros-disks/aaa.h';

const libchromeFileContents = `#ifndef CROS_DISKS_AAA_H_
#define CROS_DISKS_AAA_H_

#include <absl/types/optional.h>

namespace {
    absl::optional<int> a;
}

#endif  // CROS_DISKS_AAA_H_
`;

const libchromeLintOutput = `In File cros-disks/aaa.h line 4 col 2, found include <absl/types/optional.h (pattern: (include.*absl/types/optional.h|absl::(optional|make_optional|nullopt))), Use std::optional. absl::optional is an alias of std::optional. See go/use-std-optional-in-cros for discussion.
In File cros-disks/aaa.h line 7 col 3, found absl::optional (pattern: (include.*absl/types/optional.h|absl::(optional|make_optional|nullopt))), Use std::optional. absl::optional is an alias of std::optional. See go/use-std-optional-in-cros for discussion.`;

const pythonFileName = 'cros-disks/aaa.py';

const pythonAbsoluteFileName = '/absolute/path/to/cros-disks/aaa.py';

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
const shellLintStderr = `12:34:56: WARNING: cros-disks/aaa.sh: delete trailing blank lines
12:34:56: WARNING: cros-disks/aaa.sh:14: trim trailing whitespace: echo $1
12:34:56: ERROR: Found lint errors in 1 files in 0.029s.
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

const goFileNameTast = 'tast/aaa.go';

const goFileName = 'exmaple/aaa.go';

const goFileContents = `// fooId implements api.DutServiceServer.DetectDeviceConfigId.
func (s *Foo) FooId(
\tbar_var *api.req,
\tstream api.stream) error {
\treturn status.Error()
}`;

const goLintOutputTast = `Following errors should be modified by yourself:
  tast/aaa.go:1:10: method FooId should be FooID
  tast/aaa.go:1:3: comment on exported method FooId should be of the form "FooId ..."

  Refer the following documents for details:
   https://golang.org/wiki/CodeReviewComments#initialisms
`;

const goLintOutput = `example/aaa.go:1:3: comment on exported method FooId should be of the form "FooId ..."
example/aaa.go:3:2: don't use underscores in Go names; var bar_var should be barVar
Found 2 lint suggestions; failing.
01:43:41: ERROR: Found lint errors in 1 files in 0.044s.
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
    [libchromeFileName, libchromeFileContents],
    [pythonFileName, pythonFileContents],
    [pythonAbsoluteFileName, pythonFileContents],
    [shellFileName, shellFileContents],
    [gnFileName, gnFileContents],
    [goFileNameTast, goFileContents],
    [goFileName, goFileContents],
  ])
);
const scheme = 'testing';
vscode.workspace.registerTextDocumentContentProvider(scheme, documentProvider);

function warning(
  range: vscode.Range,
  message: string,
  source?: string
): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    range,
    message,
    vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = source;
  return diagnostic;
}

describe('Lint Integration', () => {
  it('parses C++ errors', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: cppFileName});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseCrosLintCpp(cppLintOutput, '', textDocument);
    await extensionTesting.closeDocument(textDocument);
    const expected = [
      warning(
        new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, Number.MAX_VALUE)
        ),
        'No copyright message found.  You should have a line: "Copyright [year] <Copyright Owner>"',
        'CrOS lint'
      ),
      warning(
        new vscode.Range(
          new vscode.Position(3, 0),
          new vscode.Position(3, Number.MAX_VALUE)
        ),
        'Do not use unnamed namespaces in header files.  See https://google.github.io/styleguide/cppguide.html#Namespaces for more information.',
        'CrOS lint'
      ),
    ];
    expect(expected).toEqual(actual);
  });

  it('parses libchrome errors', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: libchromeFileName});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseLibchromeCheck(
      '',
      libchromeLintOutput,
      textDocument
    );
    await extensionTesting.closeDocument(textDocument);
    const expected: vscode.Diagnostic[] = [
      warning(
        new vscode.Range(
          new vscode.Position(3, 1),
          new vscode.Position(3, Number.MAX_VALUE)
        ),
        'Use std::optional. absl::optional is an alias of std::optional. See go/use-std-optional-in-cros for discussion.',
        'CrOS libchrome'
      ),
      warning(
        new vscode.Range(
          new vscode.Position(6, 2),
          new vscode.Position(6, Number.MAX_VALUE)
        ),
        'Use std::optional. absl::optional is an alias of std::optional. See go/use-std-optional-in-cros for discussion.',
        'CrOS libchrome'
      ),
    ];
    expect(expected).toEqual(actual);
  });

  it('parses Python errors', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: pythonFileName});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseCrosLintPython(
      pythonLintOutput,
      '',
      textDocument
    );
    await extensionTesting.closeDocument(textDocument);
    const expected = [
      warning(
        new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, Number.MAX_VALUE)
        ),
        'C9001: Modules should have docstrings (even a one liner) (module-missing-docstring)',
        'CrOS lint'
      ),
      warning(
        new vscode.Range(
          new vscode.Position(2, 0),
          new vscode.Position(2, Number.MAX_VALUE)
        ),
        'C9002: Classes should have docstrings (even a one liner) (class-missing-docstring)',
        'CrOS lint'
      ),
      warning(
        new vscode.Range(
          new vscode.Position(7, 4),
          new vscode.Position(7, Number.MAX_VALUE)
        ),
        "W0612: Unused variable 'abc' (unused-variable)",
        'CrOS lint'
      ),
    ];
    expect(expected).toEqual(actual);
  });

  it('parses shell errors', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: shellFileName});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseCrosLintShell(
      shellLintOutput,
      shellLintStderr,
      textDocument
    );
    await extensionTesting.closeDocument(textDocument);
    const expected = [
      warning(
        new vscode.Range(
          new vscode.Position(2, 5),
          new vscode.Position(2, Number.MAX_VALUE)
        ),
        'note: Double quote to prevent globbing and word splitting. [SC2086]',
        'CrOS lint'
      ),
      warning(
        new vscode.Range(
          new vscode.Position(4, 0),
          new vscode.Position(4, Number.MAX_VALUE)
        ),
        'delete trailing blank lines',
        'CrOS lint'
      ),
      warning(
        new vscode.Range(
          new vscode.Position(13, 0),
          new vscode.Position(13, Number.MAX_VALUE)
        ),
        'trim trailing whitespace: echo $1',
        'CrOS lint'
      ),
    ];
    expect(actual).toEqual(expected);
  });

  it('parses GN errors', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: gnFileName});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseCrosLintGn(gnLintOutput, '', textDocument);
    await extensionTesting.closeDocument(textDocument);
    const expected = [
      warning(
        new vscode.Range(
          new vscode.Position(1, 14),
          new vscode.Position(1, Number.MAX_VALUE)
        ),
        'GnLintLibFlags: Libraries should be specified by "libs", not -l flags in "ldflags": -lm',
        'CrOS GN lint'
      ),
      warning(
        new vscode.Range(
          new vscode.Position(2, 2),
          new vscode.Position(2, Number.MAX_VALUE)
        ),
        'GnLintOrderingWithinTarget: wrong parameter order in executable(my_exec): put parameters in the following order: output_name/visibility/testonly, sources, other parameters, public_deps and deps',
        'CrOS GN lint'
      ),
    ];
    expect(expected).toEqual(actual);
  });

  it('parses go errors in tast', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: goFileNameTast});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseCrosLintGo(goLintOutputTast, '', textDocument);
    await extensionTesting.closeDocument(textDocument);
    const expected = [
      warning(
        new vscode.Range(
          new vscode.Position(0, 9),
          new vscode.Position(0, Number.MAX_VALUE)
        ),
        'method FooId should be FooID',
        'CrOS Go lint'
      ),
      warning(
        new vscode.Range(
          new vscode.Position(0, 2),
          new vscode.Position(0, Number.MAX_VALUE)
        ),
        'comment on exported method FooId should be of the form "FooId ..."',
        'CrOS Go lint'
      ),
    ];
    expect(actual).toEqual(expected);
  });

  it('parses go errors outside of tast', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: goFileName});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseCrosLintGo(goLintOutput, '', textDocument);
    await extensionTesting.closeDocument(textDocument);
    const expected = [
      warning(
        new vscode.Range(
          new vscode.Position(0, 2),
          new vscode.Position(0, Number.MAX_VALUE)
        ),
        'comment on exported method FooId should be of the form "FooId ..."',
        'CrOS Go lint'
      ),
      warning(
        new vscode.Range(
          new vscode.Position(2, 1),
          new vscode.Position(2, Number.MAX_VALUE)
        ),
        "don't use underscores in Go names; var bar_var should be barVar",
        'CrOS Go lint'
      ),
    ];
    expect(actual).toEqual(expected);
  });

  it('handles absolute document paths when parsing Python errors', async () => {
    const uri = vscode.Uri.from({scheme: scheme, path: pythonAbsoluteFileName});
    const textDocument = await vscode.workspace.openTextDocument(uri);
    const actual = crosLint.parseCrosLintPython(
      pythonLintOutput,
      '',
      textDocument
    );
    await extensionTesting.closeDocument(textDocument);
    const expected = [
      warning(
        new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(0, Number.MAX_VALUE)
        ),
        'C9001: Modules should have docstrings (even a one liner) (module-missing-docstring)',
        'CrOS lint'
      ),
      warning(
        new vscode.Range(
          new vscode.Position(2, 0),
          new vscode.Position(2, Number.MAX_VALUE)
        ),
        'C9002: Classes should have docstrings (even a one liner) (class-missing-docstring)',
        'CrOS lint'
      ),
      warning(
        new vscode.Range(
          new vscode.Position(7, 4),
          new vscode.Position(7, Number.MAX_VALUE)
        ),
        "W0612: Unused variable 'abc' (unused-variable)",
        'CrOS lint'
      ),
    ];
    expect(expected).toEqual(actual);
  });
});
