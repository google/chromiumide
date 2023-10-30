// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  EbuildStrValue,
  ParsedEbuild,
  parseEbuildOrThrow,
} from '../../../../../common/chromiumos/portage/parse';

describe('Ebuild parser', () => {
  // Helper functions to concisely define test case expectations.
  const eclass = (name: string, range: vscode.Range) =>
    ({
      name,
      range,
    } as const);
  const name = (name: string, range: vscode.Range) =>
    ({
      name,
      range,
    } as const);
  const str = (value: string, range: vscode.Range) =>
    ({
      kind: 'string',
      value,
      range,
    } as const);
  const arr = (value: EbuildStrValue[], range: vscode.Range) =>
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
            name: name('a', new vscode.Range(0, 0, 0, 1)),
            value: str('foo', new vscode.Range(0, 2, 0, 5)),
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
            name: name('b', new vscode.Range(0, 0, 0, 1)),
            value: str('bar', new vscode.Range(0, 3, 0, 6)),
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
            name: name('c', new vscode.Range(0, 0, 0, 1)),
            value: arr(
              [
                str('foo', new vscode.Range(1, 3, 1, 6)),
                str('bar', new vscode.Range(2, 3, 2, 6)),
                str('baz', new vscode.Range(3, 3, 3, 6)),
              ],
              new vscode.Range(0, 2, 4, 1)
            ),
          },
        ],
        []
      ),
    },
    {
      name: 'parses realistic example',
      content: fs.readFileSync(
        path.join(
          __dirname,
          '../../../../../../src/test/testdata/portage/portage-9999.ebuild'
        ),
        'utf8'
      ),
      want: new ParsedEbuild(
        [
          {
            name: name('a', new vscode.Range(3, 0, 3, 1)),
            value: str('1', new vscode.Range(3, 2, 3, 3)),
          },
          {
            name: name('B', new vscode.Range(4, 0, 4, 1)),
            value: str('2#3', new vscode.Range(4, 2, 4, 5)),
          },
          {
            name: name('C', new vscode.Range(5, 0, 5, 1)),
            value: str('', new vscode.Range(5, 2, 5, 2)),
          },
          {
            name: name('D', new vscode.Range(6, 0, 6, 1)),
            value: arr([], new vscode.Range(6, 2, 6, 4)),
          },
          {
            name: name('E', new vscode.Range(8, 0, 8, 1)),
            value: arr(
              [str('foo', new vscode.Range(8, 3, 8, 6))],
              new vscode.Range(8, 2, 8, 7)
            ),
          },
          {
            name: name(
              'CROS_WORKON_LOCALNAME',
              new vscode.Range(12, 0, 12, 21)
            ),
            value: str('platform2', new vscode.Range(12, 23, 12, 32)),
          },
          {
            name: name(
              'CROS_WORKON_DESTDIR_1',
              new vscode.Range(13, 0, 13, 21)
            ),
            value: str('${S}/platform2', new vscode.Range(13, 23, 13, 37)),
          },
          {
            name: name('CROS_WORKON_SUBTREE', new vscode.Range(14, 0, 14, 19)),
            value: str(
              'common-mk codelab .gn',
              new vscode.Range(14, 21, 14, 42)
            ),
          },
          {
            name: name('CROS_WORKON_DESTDIR', new vscode.Range(16, 0, 16, 19)),
            value: arr(
              [
                str('${S}/platform2', new vscode.Range(16, 22, 16, 36)),
                str(
                  '${S}/aosp/system/keymaster',
                  new vscode.Range(16, 39, 16, 65)
                ),
              ],
              new vscode.Range(16, 20, 16, 67)
            ),
          },
          {
            name: name(
              'CROS_WORKON_DESTDIR_2',
              new vscode.Range(18, 0, 18, 21)
            ),
            value: arr(
              [
                str('${S}/platform/ec', new vscode.Range(19, 3, 19, 19)),
                str(
                  '${S}/third_party/cryptoc',
                  new vscode.Range(20, 3, 20, 27)
                ),
                str('${S}/third_party/eigen3', new vscode.Range(21, 3, 21, 26)),
                str(
                  '${S}/third_party/boringssl',
                  new vscode.Range(22, 3, 22, 29)
                ),
              ],
              new vscode.Range(18, 22, 23, 1)
            ),
          },
          {
            name: name('KEYWORDS', new vscode.Range(27, 0, 27, 8)),
            value: str('~*', new vscode.Range(27, 10, 27, 12)),
          },
          {
            name: name('IUSE', new vscode.Range(28, 0, 28, 4)),
            value: str('', new vscode.Range(28, 6, 28, 6)),
          },
          {
            name: name('DEPEND', new vscode.Range(30, 0, 30, 6)),
            value: str(
              '${RDEPEND}\n\tx11-drivers/opengles-headers',
              new vscode.Range(30, 8, 31, 30)
            ),
          },
        ],
        /*inherits=*/
        [
          eclass('cros-workon', new vscode.Range(25, 8, 25, 19)),
          eclass('platform', new vscode.Range(25, 20, 25, 28)),
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
      // Separate into two cases so that the unexpected error thrown will be logged.
      if (tc.wantError) {
        try {
          parseEbuildOrThrow(tc.content);
        } catch (e) {
          expect(tc.wantError).toEqual(true);
        }
      } else {
        const got = parseEbuildOrThrow(tc.content);
        expect(got).toEqual(tc.want!);
      }
    });
  }
});
