// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  ParsedEbuild,
  parseEbuildOrThrow,
} from '../../../../../common/chromiumos/portage/parse';

describe('Ebuild parser', () => {
  // Helper functions to concisely define test case expectations.
  const str = (value: string) =>
    ({
      kind: 'string',
      value,
    } as const);
  const arr = (value: string[]) =>
    ({
      kind: 'array',
      value,
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
      want: {
        assignments: [],
      },
    },
    {
      name: 'parses realistic example',
      content: `
# Copyright 2019 The ChromiumOS Authors
# Distributed under the terms of the GNU General Public License v2

a=1 # comment
B=2#3
C= # empty#
D=()

E=(foo) #

# Some real examples follow.

CROS_WORKON_LOCALNAME="platform2"
CROS_WORKON_DESTDIR="\${S}/platform2"
CROS_WORKON_SUBTREE="common-mk codelab .gn"

CROS_WORKON_DESTDIR=("\${S}/platform2" "\${S}/aosp/system/keymaster")

CROS_WORKON_DESTDIR_2=(
\t"\${S}/platform/ec"
\t"\${S}/third_party/cryptoc"
\t"\${S}/third_party/eigen3"
\t"\${S}/third_party/boringssl"
)

inherit cros-workon platform

KEYWORDS="~*"
IUSE=""

DEPEND="\${RDEPEND}
\tx11-drivers/opengles-headers"

src_install() {
  platform_src_install

  dobin "\${OUT}"/codelab
}

platform_pkg_test() {
  platform_test "run" "\${OUT}/codelab_test"
}
`,
      want: {
        assignments: [
          {
            name: 'a',
            value: str('1'),
          },
          {
            name: 'B',
            value: str('2#3'),
          },
          {
            name: 'C',
            value: str(''),
          },
          {
            name: 'D',
            value: arr([]),
          },
          {
            name: 'E',
            value: arr(['foo']),
          },
          {
            name: 'CROS_WORKON_LOCALNAME',
            value: str('platform2'),
          },
          {
            name: 'CROS_WORKON_DESTDIR',
            value: str('${S}/platform2'),
          },
          {
            name: 'CROS_WORKON_SUBTREE',
            value: str('common-mk codelab .gn'),
          },
          {
            name: 'CROS_WORKON_DESTDIR',
            value: arr(['${S}/platform2', '${S}/aosp/system/keymaster']),
          },
          {
            name: 'CROS_WORKON_DESTDIR_2',
            value: arr([
              '${S}/platform/ec',
              '${S}/third_party/cryptoc',
              '${S}/third_party/eigen3',
              '${S}/third_party/boringssl',
            ]),
          },
          {
            name: 'KEYWORDS',
            value: str('~*'),
          },
          {
            name: 'IUSE',
            value: str(''),
          },
          {
            name: 'DEPEND',
            value: str('${RDEPEND}\n\tx11-drivers/opengles-headers'),
          },
        ],
      },
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
      try {
        const got = parseEbuildOrThrow(tc.content);
        expect(got).toEqual(tc.want!);
      } catch (e) {
        expect(tc.wantError).toEqual(true);
      }
    });
  }
});
