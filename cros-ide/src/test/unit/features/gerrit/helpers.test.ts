// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as helpers from '../../../../features/gerrit/helpers';

type TestArrayMap = {
  [filePath: string]: number[];
};

describe('splitPathArrayMap', () => {
  it('splits objects based on the group key', () => {
    const input: TestArrayMap = {
      'a.cc': [1, 1, 2],
      'b.cc': [2, 3, 3],
    };
    const identity = (n: number) => n;
    const want: [number, TestArrayMap][] = [
      [
        1,
        {
          'a.cc': [1, 1],
        },
      ],
      [
        2,
        {
          'a.cc': [2],
          'b.cc': [2],
        },
      ],
      [
        3,
        {
          'b.cc': [3, 3],
        },
      ],
    ];
    expect(helpers.splitPathArrayMap(input, identity)).toEqual(want);
  });

  it('can map different values to the same bucket', () => {
    const input: TestArrayMap = {
      'a.cc': [1, 1, 2],
      'b.cc': [2, 4, 5],
    };
    const div2 = (n: number) => Math.floor(n / 2);
    const want: [number, TestArrayMap][] = [
      [0, {'a.cc': [1, 1]}],
      [1, {'a.cc': [2], 'b.cc': [2]}],
      [2, {'b.cc': [4, 5]}],
    ];
    expect(helpers.splitPathArrayMap(input, div2)).toEqual(want);
  });
});
