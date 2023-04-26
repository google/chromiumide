// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import assert from 'assert';
import * as shutil from '../../../common/shutil';

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
      assert.deepStrictEqual(shutil.escape(input), expected);
    }
  });

  it('escapes string arrays', () => {
    assert.deepStrictEqual(
      shutil.escapeArray(['abc', 'def ghi']),
      "abc 'def ghi'"
    );
  });
});
