// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as parser from '../../../../features/gtest/parser';

describe('gtest parser', () => {
  it('parses gtest cases', async () => {
    const content = [
      //             v 14
      'TEST(foo, bar) {', // Line 0
      '}',
      '// TEST(comment, out) {}',
      'TEST(A_b, c) {}', // Line 3
      //           ^ 12
      'TEST(A_b, d) {}', // Line 4
      //           ^ 12
    ].join('\n');

    const fooBarRange = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 14)
    );

    const abcRange = new vscode.Range(
      new vscode.Position(3, 0),
      new vscode.Position(3, 12)
    );

    const abdRange = new vscode.Range(
      new vscode.Position(4, 0),
      new vscode.Position(4, 12)
    );

    expect(parser.parse(content)).toEqual(
      new Map([
        [
          'foo',
          {
            range: fooBarRange,
            cases: new Map([['bar', {range: fooBarRange}]]),
            isParametrized: false,
          },
        ],
        [
          'A_b',
          {
            range: abcRange,
            cases: new Map([
              ['c', {range: abcRange}],
              ['d', {range: abdRange}],
            ]),
            isParametrized: false,
          },
        ],
      ])
    );
  });

  it('parses complex gtest cases', async () => {
    const content = [
      //                              v 31
      '   TEST_F  (   foo  ,   bar   ) {', // Line 0
      '}',
      '',
      'TEST_P(multiple,',
      '  lines) {}', // Line 4
      //       ^ 8
    ].join('\n');

    const fooBarRange = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 31)
    );
    const multipleLinesRange = new vscode.Range(
      new vscode.Position(3, 0),
      new vscode.Position(4, 8)
    );

    expect(parser.parse(content)).toEqual(
      new Map([
        [
          'foo',
          {
            range: fooBarRange,
            cases: new Map([['bar', {range: fooBarRange}]]),
            isParametrized: false,
          },
        ],
        [
          'multiple',
          {
            range: multipleLinesRange,
            cases: new Map([['lines', {range: multipleLinesRange}]]),
            isParametrized: true,
          },
        ],
      ])
    );
  });

  it('parses Chromium browser tests and typed tests', async () => {
    const content = [
      //                               v 32
      'IN_PROC_BROWSER_TEST_F(foo, bar) {}',
      //                       v 24
      'TYPED_TEST(hello, world) {}',
      //                                        v 41
      'TYPED_IN_PROC_BROWSER_TEST_P(suite, name) {}',
    ].join('\n');

    const fooRange = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 32)
    );

    const helloRange = new vscode.Range(
      new vscode.Position(1, 0),
      new vscode.Position(1, 24)
    );

    const suiteRange = new vscode.Range(
      new vscode.Position(2, 0),
      new vscode.Position(2, 41)
    );

    expect(parser.parse(content)).toEqual(
      new Map([
        [
          'foo',
          {
            range: fooRange,
            cases: new Map([['bar', {range: fooRange}]]),
            isParametrized: false,
          },
        ],
        [
          'hello',
          {
            range: helloRange,
            cases: new Map([['world', {range: helloRange}]]),
            isParametrized: false,
          },
        ],
        [
          'suite',
          {
            range: suiteRange,
            cases: new Map([['name', {range: suiteRange}]]),
            isParametrized: true,
          },
        ],
      ])
    );
  });
});
