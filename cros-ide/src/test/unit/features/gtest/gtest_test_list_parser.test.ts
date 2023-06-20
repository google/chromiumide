// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as gtestTestListParser from '../../../../features/gtest/gtest_test_list_parser';

describe('Gtest test list parser', () => {
  it('parses --gtest_list_tests output', () => {
    const input = `\
Foo.
  Bar
  X
Foo/Foo.
  TestP/0  # GetParam() = false
  TestP/1  # GetParam() = true
  TestQ/0  # GetParam() = false
  TestQ/1  # GetParam() = true
NoPrefix.
  TestP/A  # GetParam() = ...
  TestP/B  # GetParam() = ...
TypedTest.  # TypeParam =
  TypedTestName  # GetParam() =
`;
    const result = gtestTestListParser.parse(input);
    expect([...new Set(result)]).toEqual([
      'Foo.Bar',
      'Foo.X',
      'Foo.TestP',
      'Foo.TestQ',
      'NoPrefix.TestP',
      'TypedTest.TypedTestName',
    ]);
  });
});
