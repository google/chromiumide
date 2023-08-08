// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

type TestCaseInstance = {
  range: vscode.Range; // 0-based
  // A single test suite can have both non-parameterized and parameterized tests
  isParameterized: boolean;
};

type TestSuiteInstance = {
  range: vscode.Range; // 0-based
  cases: TestCaseMap;
  isTyped: boolean;
};

export type TestCaseMap = Map<string, TestCaseInstance>;
export type TestSuiteMap = Map<string, TestSuiteInstance>;

/**
 * Parse the given file content and finds gtest test cases.
 *
 * @returns A map from test suite names to the location and test cases of that suite.
 */
export function parse(content: string): TestSuiteMap {
  const res: TestSuiteMap = new Map();

  // Match with strings like "TEST(foo, bar)".
  // https://google.github.io/googletest/reference/testing.html
  const re =
    /^[^\S\n]*(?<typed>TYPED_)?(?:IN_PROC_BROWSER_)?TEST(?<parameterized>_F|_P)?\s*\(\s*(?<suite>\w+)\s*,\s*(?<name>\w+)\s*\)/gm;
  let m;

  let index = 0;
  let row = 0;
  let col = 0;

  const proceed = (endIndex: number) => {
    for (; index < endIndex; index++) {
      if (content[index] === '\n') {
        row++;
        col = 0;
      } else {
        col++;
      }
    }
  };

  while ((m = re.exec(content)) !== null) {
    proceed(m.index);
    const start = new vscode.Position(row, col);

    proceed(m.index + m[0].length);
    const end = new vscode.Position(row, col);

    const range = new vscode.Range(start, end);

    const {suite, name, parameterized, typed} = m.groups!;
    const isParameterized = parameterized === '_P';
    const isTyped = typed === 'TYPED_';

    if (!res.has(suite)) {
      // TODO(cmfcmf): For `TEST_F` and `TEST_P`, we should consider using the location of the
      // fixture class as the `range`, instead of using the location of the first test case.
      res.set(suite, {range, cases: new Map(), isTyped});
    }
    const suiteInstance = res.get(suite)!;
    suiteInstance.cases.set(name, {range, isParameterized});
  }

  return res;
}
