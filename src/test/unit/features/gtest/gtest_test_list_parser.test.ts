// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as gtestTestListParser from '../../../../features/gtest/gtest_test_list_parser';

describe('Gtest test list parser', () => {
  it('parses --gtest_list_tests output', () => {
    const input = `\
TestSuite.
  TestCase
TestFixture.
  TestCase
TypedTest/0.  # TypeParam = char
  TestCase
TypedTest/1.  # TypeParam = int
  TestCase
TypedTestWithTypeNameGenerator/char.  # TypeParam = char
  TestCase
TypedTestWithTypeNameGenerator/int.  # TypeParam = int
  TestCase
TypeParameterizedTest/0.  # TypeParam = char
  TestCase
TypeParameterizedTest/1.  # TypeParam = int
  TestCase
Instantiation/TypeParameterizedTest/0.  # TypeParam = char
  TestCase
Instantiation/TypeParameterizedTest/1.  # TypeParam = int
  TestCase
InstantiationWithTypeNameGenerator/TypeParameterizedTest/char.  # TypeParam = char
  TestCase
InstantiationWithTypeNameGenerator/TypeParameterizedTest/int.  # TypeParam = int
  TestCase
ParameterizedTest.
  TestCase/0  # GetParam() = false
  TestCase/1  # GetParam() = true
Instantiation/ParameterizedTest.
  TestCase/0  # GetParam() = false
  TestCase/1  # GetParam() = true
InstantiationWithParamNameGenerator/ParameterizedTest.
  TestCase/false  # GetParam() = false
  TestCase/true  # GetParam() = true
`;
    const result = gtestTestListParser.parse(input);
    expect(result).toBeInstanceOf(gtestTestListParser.TestNameCollection);
    if (result instanceof Error) {
      fail(result);
      return;
    }

    expect(result.getFullTestNames()).toEqual(
      new Set([
        'TestSuite.TestCase',
        'TestFixture.TestCase',

        'TypedTest/0.TestCase',
        'TypedTest/1.TestCase',

        'TypedTestWithTypeNameGenerator/char.TestCase',
        'TypedTestWithTypeNameGenerator/int.TestCase',

        'TypeParameterizedTest/0.TestCase',
        'TypeParameterizedTest/1.TestCase',

        'Instantiation/TypeParameterizedTest/0.TestCase',
        'Instantiation/TypeParameterizedTest/1.TestCase',

        'InstantiationWithTypeNameGenerator/TypeParameterizedTest/char.TestCase',
        'InstantiationWithTypeNameGenerator/TypeParameterizedTest/int.TestCase',

        'ParameterizedTest.TestCase/0',
        'ParameterizedTest.TestCase/1',

        'Instantiation/ParameterizedTest.TestCase/0',
        'Instantiation/ParameterizedTest.TestCase/1',

        'InstantiationWithParamNameGenerator/ParameterizedTest.TestCase/false',
        'InstantiationWithParamNameGenerator/ParameterizedTest.TestCase/true',
      ])
    );
    expect(result.getSuiteAndCaseNames()).toEqual(
      new Set([
        'TestSuite.TestCase',
        'TestFixture.TestCase',

        'TypedTest.TestCase',

        'TypedTestWithTypeNameGenerator.TestCase',

        'TypeParameterizedTest.TestCase',

        'ParameterizedTest.TestCase',
        'ParameterizedTest.TestCase',
      ])
    );

    expect(
      result.hasFullTestName(
        'InstantiationWithTypeNameGenerator/TypeParameterizedTest/char.TestCase'
      )
    ).toBeTrue();
    expect(result.hasFullTestName('Foo/Foo.TestP/3')).toBeFalse();
    expect(
      result.hasSuiteAndCaseName('TypedTestWithTypeNameGenerator.TestCase')
    ).toBeTrue();
    expect(result.hasSuiteAndCaseName('TestSuite.TestCase')).toBeTrue();
    expect(result.hasSuiteAndCaseName('Foo.TestP')).toBeFalse();
    expect(result.hasSuiteAndCaseName('TypedTest/0.TestCase')).toBeFalse();
  });

  it('parses Chromium browser test output', () => {
    // Chromium browser tests all have `# TypeParam = ` and `# GetParam() = `, even though they are
    // not necessarily parametrized nor typed.
    //
    // Also, it is apparently possible for a test to have some cases that are parametrized, and
    // others that are not.
    const input = `\
PlatformAppBrowserTest.  # TypeParam = \n\
  RunningAppsAreRecorded  # GetParam() = \n\
  ActiveAppsAreRecorded  # GetParam() = \n\
SandboxedPagesTest.  # TypeParam = \n\
  ManifestV2DisallowsWebContent  # GetParam() = \n\
  SandboxedPages/0  # GetParam() = 4-byte object <00-00 00-00>
`;
    const result = gtestTestListParser.parse(input);
    expect(result).toBeInstanceOf(gtestTestListParser.TestNameCollection);
    if (result instanceof Error) {
      fail(result);
      return;
    }

    expect(result.getFullTestNames()).toEqual(
      new Set([
        'PlatformAppBrowserTest.RunningAppsAreRecorded',
        'PlatformAppBrowserTest.ActiveAppsAreRecorded',
        'SandboxedPagesTest.ManifestV2DisallowsWebContent',
        'SandboxedPagesTest.SandboxedPages/0',
      ])
    );
    expect(result.getSuiteAndCaseNames()).toEqual(
      new Set([
        'PlatformAppBrowserTest.RunningAppsAreRecorded',
        'PlatformAppBrowserTest.ActiveAppsAreRecorded',
        'SandboxedPagesTest.ManifestV2DisallowsWebContent',
        'SandboxedPagesTest.SandboxedPages',
      ])
    );
  });
});
