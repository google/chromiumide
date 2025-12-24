// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  EbuildStrValue,
  ParsedEbuild,
  Range,
  parseEbuildOrThrow,
} from '../../../../../../server/ebuild_lsp/shared/parse';
import * as testing from '../../../../testing';
import {FakeTextDocument} from '../../../../testing/fakes';

function range(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number
): Range {
  return {
    start: new vscode.Position(startLine, startCharacter),
    end: new vscode.Position(endLine, endCharacter),
  };
}

describe('Ebuild parser', () => {
  // Helper functions to concisely define test case expectations.
  const eclass = (name: string, range: Range) =>
    ({
      name,
      range,
    } as const);
  const name = (name: string, range: Range) =>
    ({
      name,
      range,
    } as const);
  const str = (value: string, range: Range) =>
    ({
      kind: 'string',
      value,
      range,
    } as const);
  const arr = (value: EbuildStrValue[], range: Range) =>
    ({
      kind: 'array',
      value,
      range,
    } as const);

  const testCases: {
    name: string;
    content: string;
    want?: ParsedEbuild;
    wantError?: boolean;
  }[] = [
    {
      name: 'parses empty file',
      content: '',
      want: new ParsedEbuild([], []),
    },
    {
      name: 'parses one-str-variable file without quotes',
      content: 'a=foo\n',
      want: new ParsedEbuild(
        [
          {
            name: name('a', range(0, 0, 0, 1)),
            value: str('foo', range(0, 2, 0, 5)),
          },
        ],
        []
      ),
    },
    {
      name: 'parses one-str-variable file with quotes',
      content: 'b="bar"\n',
      want: new ParsedEbuild(
        [
          {
            name: name('b', range(0, 0, 0, 1)),
            value: str('bar', range(0, 3, 0, 6)),
          },
        ],
        []
      ),
    },
    {
      name: 'parses one-arr-variable file',
      content: `c=(
\t"foo"
\t"bar"
\t"baz"
)
`,
      want: new ParsedEbuild(
        [
          {
            name: name('c', range(0, 0, 0, 1)),
            value: arr(
              [
                str('foo', range(1, 3, 1, 6)),
                str('bar', range(2, 3, 2, 6)),
                str('baz', range(3, 3, 3, 6)),
              ],
              range(0, 2, 4, 1)
            ),
          },
        ],
        []
      ),
    },
    {
      name: 'parses realistic example',
      content: testing.testdataString('portage/portage-9999.ebuild'),
      want: new ParsedEbuild(
        [
          {
            name: name('a', range(3, 0, 3, 1)),
            value: str('1', range(3, 2, 3, 3)),
          },
          {
            name: name('B', range(4, 0, 4, 1)),
            value: str('2#3', range(4, 2, 4, 5)),
          },
          {
            name: name('C', range(5, 0, 5, 1)),
            value: str('', range(5, 2, 5, 2)),
          },
          {
            name: name('D', range(6, 0, 6, 1)),
            value: arr([], range(6, 2, 6, 4)),
          },
          {
            name: name('E', range(8, 0, 8, 1)),
            value: arr([str('foo', range(8, 3, 8, 6))], range(8, 2, 8, 7)),
          },
          {
            name: name('CROS_WORKON_LOCALNAME', range(12, 0, 12, 21)),
            value: str('platform2', range(12, 23, 12, 32)),
          },
          {
            name: name('CROS_WORKON_DESTDIR_1', range(13, 0, 13, 21)),
            value: str('${S}/platform2', range(13, 23, 13, 37)),
          },
          {
            name: name('CROS_WORKON_SUBTREE', range(14, 0, 14, 19)),
            value: str('common-mk codelab .gn', range(14, 21, 14, 42)),
          },
          {
            name: name('CROS_WORKON_DESTDIR', range(16, 0, 16, 19)),
            value: arr(
              [
                str('${S}/platform2', range(16, 22, 16, 36)),
                str('${S}/aosp/system/keymaster', range(16, 39, 16, 65)),
              ],
              range(16, 20, 16, 67)
            ),
          },
          {
            name: name('CROS_WORKON_DESTDIR_2', range(18, 0, 18, 21)),
            value: arr(
              [
                str('${S}/platform/ec', range(19, 3, 19, 19)),
                str('${S}/third_party/cryptoc', range(20, 3, 20, 27)),
                str('${S}/third_party/eigen3', range(21, 3, 21, 26)),
                str('${S}/third_party/boringssl', range(22, 3, 22, 29)),
              ],
              range(18, 22, 23, 1)
            ),
          },
          {
            name: name('KEYWORDS', range(27, 0, 27, 8)),
            value: str('~*', range(27, 10, 27, 12)),
          },
          {
            name: name('IUSE', range(28, 0, 28, 4)),
            value: str('', range(28, 6, 28, 6)),
          },
          {
            name: name('DEPEND', range(30, 0, 30, 6)),
            value: str(
              '${RDEPEND}\n\tx11-drivers/opengles-headers',
              range(30, 8, 31, 30)
            ),
          },
        ],
        /*inherits=*/
        [
          eclass('cros-workon', range(25, 8, 25, 19)),
          eclass('platform', range(25, 20, 25, 28)),
        ]
      ),
    },
    {
      name: 'throws on unclosed paren',
      content: 'A=(',
      wantError: true,
    },
    {
      name: 'throws on unclosed string',
      content: 'A="',
      wantError: true,
    },
  ];

  for (const tc of testCases) {
    it(tc.name, () => {
      const document = new FakeTextDocument({text: tc.content});
      // Separate into two cases so that the unexpected error thrown will be logged.
      if (tc.wantError) {
        try {
          parseEbuildOrThrow(document);
        } catch (e) {
          expect(tc.wantError).toEqual(true);
        }
      } else {
        const got = parseEbuildOrThrow(document);
        expect(got).toEqual(tc.want!);
      }
    });
  }
});
