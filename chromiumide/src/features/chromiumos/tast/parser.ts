// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';

export type ParsedTestCase = {
  name: string;
  range: vscode.Range;
};

/**
 * Parse the content and returns the test name, if it contains a test.
 * Returns undefined otherwise.
 */
export function parseTestCase(
  document: vscode.TextDocument
): ParsedTestCase | undefined {
  const category = path.basename(path.dirname(document.uri.fsPath));

  const content = document.getText();

  const testFuncRe = /^\s*Func:\s*(\w+),/m;
  // Check if it is possible to run a test from the file.
  const testFuncMatch = content.match(testFuncRe);
  if (!testFuncMatch) {
    return undefined;
  }
  const testFuncName = testFuncMatch[1];

  const testDefinitionRe = new RegExp(
    `^[^\\S\\n]*func\\s*${testFuncName}\\s*\\(`,
    'm'
  );
  const testDefinitionMatch = testDefinitionRe.exec(content);
  if (!testDefinitionMatch) {
    return undefined;
  }

  const start = document.positionAt(testDefinitionMatch.index);
  const end = document.positionAt(
    testDefinitionMatch.index + testDefinitionMatch[0].length
  );

  const name = `${category}.${testFuncName}`;
  const range = new vscode.Range(start, end);
  return {
    name,
    range,
  };
}
