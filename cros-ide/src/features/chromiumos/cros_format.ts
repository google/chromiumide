// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import * as ideUtil from '../../ide_util';

export function activate(context: vscode.ExtensionContext) {
  // File name patterns were copied from
  // https://source.chromium.org/chromium/chromium/src/+/main:third_party/chromite/cli/cros/cros_format.py
  // TODO(b:232466489): figure out a better way of sharing what's supported by `cros lint`
  // TODO(b:232466489): revisit intentionally omitted file types
  const globs = [
    // JSON omitted intentionally: there is ongoing discussion about it.
    '*.md',
    '*.cfg',
    '*.conf',
    '*.txt',
    '.clang-format',
    '.gitignore',
    '.gitmodules',
    // GN omitted intentionally: it has its own formatter.
    'COPYING*',
    'LICENSE*',
    'make.defaults',
    'package.accept_keywords',
    'package.force',
    'package.keywords',
    'package.mask',
    'package.provided',
    'package.unmask',
    'package.use',
    'package.use.mask',
    'DIR_METADATA',
    'OWNERS*',
  ];
  const documentSelector = globs.map(g => {
    return {schema: 'file', pattern: '**/' + g};
  });
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      documentSelector,
      new CrosFormat()
    )
  );
}

// TODO(b:232466489): add tests
class CrosFormat implements vscode.DocumentFormattingEditProvider {
  async provideDocumentFormattingEdits(document: vscode.TextDocument) {
    const formatterOutput = await commonUtil.exec(
      'cros',
      ['format', '--stdout', document.uri.fsPath],
      {
        logger: ideUtil.getUiLogger(),
        ignoreNonZeroExit: true,
      }
    );

    if (formatterOutput instanceof Error) {
      void vscode.window.showInformationMessage(formatterOutput.message);
      return undefined;
    }

    // 0 is returned when the input does not require formatting.
    if (formatterOutput.exitStatus === 0) {
      return undefined;
    }

    const wholeFileRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );

    return [vscode.TextEdit.replace(wholeFileRange, formatterOutput.stdout)];
  }
}
