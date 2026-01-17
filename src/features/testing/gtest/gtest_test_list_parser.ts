// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

type TestNameComponents = {
  readonly suite: string;
  readonly case: string;
} & (
  | {readonly parameterKind: 'none'}
  | {
      readonly parameterKind: 'value';
      readonly instantiation: string;
      readonly paramName: string;
    }
  | {
      // We do not distinguish between typed and type-parameterized tests, because their test name
      // format overlaps.
      readonly parameterKind: 'type';
      readonly instantiation: string;
      readonly typeName: string;
    }
);

/**
 * Gtest names can have a variety of formats:
 *
 * Non-parameterized tests:
 * - <Suite>.<Case> for `TEST(Suite, Case)`
 * - <Fixture>.<Case> for `TEST_F(Fixture, Case)`
 *
 * Value-parameterized tests:
 * - <Suite>.<Case>/<ParamName> for
 *   ```
 *   TEST_P(Suite, Case) {}
 *   INSTANTIATE_TEST_SUITE_P( , Suite, Case, Values(...))
 *                            ^- note how the instantiation param is empty.
 *   ```
 * - <Instantiation>/<Suite>.<Case>/<ParamName> for
 *   ```
 *   TEST_P(Suite, Case) {}
 *   INSTANTIATE_TEST_SUITE_P(Instantiation, Suite, Case, Values(...))
 *   ```
 *
 * Typed tests:
 * - <Suite>/<TypeName>.<Case> for
 *   ```
 *   TYPED_TEST_SUITE(Suite, Types(...))
 *   TYPED_TEST(Suite, Case)
 *   ```
 *
 * Type-parameterized tests:
 * - <Suite>/<TypeName>.<Case> for
 *   ```
 *   TYPED_TEST_SUITE_P(Suite)
 *   TYPED_TEST_P(Suite, Case)
 *   INSTANTIATE_TYPED_TEST_SUITE_P( , Suite, Types(...))
 *                                  ^- note how the instantiation param is empty.
 *   ```
 * - <Instantiation>/<Suite>/<TypeName>.<Case> for
 *   ```
 *   TYPED_TEST_SUITE_P(Suite)
 *   TYPED_TEST_P(Suite, Case)
 *   INSTANTIATE_TYPED_TEST_SUITE_P(Instantiation, Suite, Types(...))
 *   ```
 */
export class TestNameCollection {
  private readonly fullTestNames: ReadonlySet<string>;
  private readonly suiteAndCaseNames: ReadonlySet<string>;

  constructor(parsedTestNames: TestNameComponents[]) {
    const fullTestNames = new Set<string>();
    const suiteAndCaseNames = new Set<string>();

    parsedTestNames.forEach(parsedTestName => {
      suiteAndCaseNames.add(`${parsedTestName.suite}.${parsedTestName.case}`);

      let testName;
      switch (parsedTestName.parameterKind) {
        case 'none':
          testName = `${parsedTestName.suite}.${parsedTestName.case}`;
          break;
        case 'value':
          testName = `${parsedTestName.suite}.${parsedTestName.case}/${parsedTestName.paramName}`;
          if (parsedTestName.instantiation.length > 0) {
            testName = `${parsedTestName.instantiation}/${testName}`;
          }
          break;
        case 'type':
          testName = `${parsedTestName.suite}/${parsedTestName.typeName}.${parsedTestName.case}`;
          if (parsedTestName.instantiation.length > 0) {
            testName = `${parsedTestName.instantiation}/${testName}`;
          }
          break;
      }

      fullTestNames.add(testName);
    });

    this.fullTestNames = fullTestNames;
    this.suiteAndCaseNames = suiteAndCaseNames;
  }

  hasFullTestName(fullTestName: string): boolean {
    return this.fullTestNames.has(fullTestName);
  }

  hasSuiteAndCaseName(suiteAndCaseName: string): boolean {
    return this.suiteAndCaseNames.has(suiteAndCaseName);
  }

  getFullTestNames(): ReadonlySet<string> {
    return this.fullTestNames;
  }

  getSuiteAndCaseNames(): ReadonlySet<string> {
    return this.suiteAndCaseNames;
  }
}

function parseLine(line: string): {
  value: string;
  isIndented: boolean;
  comment: string;
} {
  const commentIdx = line.indexOf('#');
  return {
    value: (commentIdx >= 0 ? line.slice(0, commentIdx) : line).trim(),
    isIndented: line.startsWith('  '),
    comment: commentIdx >= 0 ? line.slice(commentIdx) : '',
  };
}

/**
 * Parses output from a gtest executable run with the --gtest_list_tests flag and returns the
 * tests names as an instance of `TestNameCollection`.
 */
export function parse(stdout: string): TestNameCollection | Error {
  const allTestNameComponents: TestNameComponents[] = [];

  let parentLine: {value: string; comment: string} | null = null;
  for (const rawLine of stdout.trim().split('\n')) {
    const {value, isIndented, comment} = parseLine(rawLine);
    if (!isIndented) {
      parentLine = {value, comment};
      continue;
    }
    if (!parentLine) {
      continue;
    }
    const childLine = {value, comment};

    const fullTestName = parentLine.value + childLine.value;
    // It is important to check that the TypeParam is not just empty, but actually equals a value.
    // Otherwise the test might not actually be typed.
    const isTyped = parentLine.comment.match(/^# TypeParam = .+$/);
    // It is important to check that the GetParam is not just empty, but actually equals a value.
    // Otherwise the test might not actually be parameterized.
    const isParameterized = childLine.comment.match(/^# GetParam\(\) = .+$/);

    const createError = () =>
      new Error(
        `Unable to parse test list line: "${JSON.stringify(
          childLine
        )}" (parent line: ${JSON.stringify(
          parentLine
        )}), ${isTyped}, ${isParameterized})`
      );

    const parts = fullTestName.split('/');
    if (parts.length === 1) {
      // This is a non-parameterized test (`TestSuite.TestCase`).
      if (isParameterized || isTyped) {
        return createError();
      }
      const [suite, caseName] = parts[0]!.split('.');
      allTestNameComponents.push({
        parameterKind: 'none',
        suite,
        case: caseName,
      });
    } else if (parts.length === 2) {
      // This is a value-parameterized test without an instantiation name
      // (`ParameterizedTest.TestCase/0`), a typed test (`TypedTest/0.TestCase`), or a
      // type-parameterized test without an instantiation name (`TypeParameterizedTest/0.TestCase`).
      if (isTyped) {
        const [typeName, caseName] = parts[1]!.split('.');
        allTestNameComponents.push({
          parameterKind: 'type',
          instantiation: '',
          suite: parts[0]!,
          case: caseName,
          typeName,
        });
      } else {
        if (!isParameterized) {
          return createError();
        }
        const [suite, caseName] = parts[0]!.split('.');
        allTestNameComponents.push({
          parameterKind: 'value',
          instantiation: '',
          suite: suite,
          case: caseName,
          paramName: parts[1]!,
        });
      }
    } else if (parts.length === 3) {
      // This is either a value-parameterized test with an instantiation name
      // (`Instantiation/ParameterizedTest.TestCase/0`) or a type-parameterized test with an
      // instantiation name (`Instantiation/TypeParameterizedTest/0.TestCase`).
      const instantiation = parts[0]!;
      if (isTyped) {
        const [typeName, caseName] = parts[2]!.split('.');
        allTestNameComponents.push({
          parameterKind: 'type',
          instantiation,
          suite: parts[1]!,
          case: caseName,
          typeName,
        });
      } else {
        if (!isParameterized) {
          return createError();
        }
        const [suite, caseName] = parts[1]!.split('.');
        allTestNameComponents.push({
          parameterKind: 'value',
          instantiation,
          suite: suite,
          case: caseName,
          paramName: parts[2]!,
        });
      }
    } else {
      return createError();
    }
  }

  return new TestNameCollection(allTestNameComponents);
}
