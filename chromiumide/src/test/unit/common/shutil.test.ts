// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as shutil from '../../../../shared/app/common/shutil';

describe('Shell Utility', () => {
  it('escapes strings when needed', () => {
    const testData: [input: string, expected: string][] = [
      ['', "''"],
      [' ', "' '"],
      ['\t', "'\t'"],
      ['\n', "'\n'"],
      ['ab', 'ab'],
      ['a b', "'a b'"],
      ['ab ', "'ab '"],
      [' ab', "' ab'"],
      ['AZaz09@%_+=:,./-', 'AZaz09@%_+=:,./-'],
      ['a!b', "'a!b'"],
      ["'", "''\"'\"''"],
      ['"', "'\"'"],
      ['=foo', "'=foo'"],
      ["Tast's", "'Tast'\"'\"'s'"],
    ];
    for (const [input, expected] of testData) {
      expect(shutil.escape(input)).toEqual(expected);
    }
  });

  it('escapes string arrays', () => {
    expect(shutil.escapeArray(['abc', 'def ghi'])).toEqual("abc 'def ghi'");
  });
});
