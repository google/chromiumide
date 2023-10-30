// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as helpers from '../../../../features/gerrit/helpers';
import {formatGerritTimestamp} from '../../../../features/gerrit/helpers';

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
    const want = new Map<number, TestArrayMap>([
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
    ]);
    expect(helpers.splitPathArrayMap(input, identity)).toEqual(want);
  });

  it('can map different values to the same bucket', () => {
    const input: TestArrayMap = {
      'a.cc': [1, 1, 2],
      'b.cc': [2, 4, 5],
    };
    const div2 = (n: number) => Math.floor(n / 2);
    const want = new Map<number, TestArrayMap>([
      [0, {'a.cc': [1, 1]}],
      [1, {'a.cc': [2], 'b.cc': [2]}],
      [2, {'b.cc': [4, 5]}],
    ]);
    expect(helpers.splitPathArrayMap(input, div2)).toEqual(want);
  });
});

describe('formatGerritTimestaps', () => {
  it("formats today's date as hours and minutes", () => {
    const now = new Date();

    const year = now.getUTCFullYear().toString();
    const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = now.getUTCDate().toString().padStart(2, '0');
    const hours = now.getUTCHours().toString().padStart(2, '0');
    const minutes = now.getUTCMinutes().toString().padStart(2, '0');

    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:04.000000000`;
    // We don't know the local timezone, only match the regex.
    expect(formatGerritTimestamp(timestamp)).toMatch(/[0-9]{2}:[0-9]{2}/);
  });

  it('formats dates long time ago as year, month, and day', () => {
    // Test only the year, because month name could be localized
    // and the day may depend on the timezone
    expect(formatGerritTimestamp('2018-09-27 09:25:04.000000000')).toMatch(
      /^2018/
    );
  });

  it('does not crash on malformed input', () => {
    const badTimestamp = 'last Monday';
    expect(formatGerritTimestamp(badTimestamp)).toEqual(badTimestamp);
  });
});
