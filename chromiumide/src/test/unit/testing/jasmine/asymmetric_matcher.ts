// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This class defines custom AsymmetricMatcher. The type is somehow referred to as
// AsymmetricEqualityTester in the official document.
// https://jasmine.github.io/api/4.1/AsymmetricEqualityTester.html

/**
 * Returns a matcher that will succeed if the actual value is an Array that starts with the given
 * prefix.
 */
export function arrayWithPrefix<T>(
  ...prefix: T[]
): jasmine.AsymmetricMatcher<T[]> {
  return {
    asymmetricMatch(other: T[], util: jasmine.MatchersUtil): boolean {
      return (
        prefix.length <= other.length &&
        prefix.every((t, i) => util.equals(other[i], t))
      );
    },
    jasmineToString(): string {
      return `<an array starts with ${prefix}>`;
    },
  };
}

/**
 * Returns a matcher that will succeed if the actual value is an Array that starts with the given
 * prefix and the rest of the array matches with the given matcher.
 */
export function arrayWithPrefixAnd<T>(
  prefix: T[],
  then: jasmine.AsymmetricMatcher<T[]> | T[]
): jasmine.AsymmetricMatcher<T[]> {
  return {
    asymmetricMatch(other: T[], util: jasmine.MatchersUtil): boolean {
      if (!arrayWithPrefix(...prefix).asymmetricMatch(other, util)) {
        return false;
      }
      const rest = other.slice(prefix.length);
      if (Array.isArray(then)) {
        return util.equals(then, rest);
      }
      return then.asymmetricMatch(rest, util);
    },
    jasmineToString(pp: (value: unknown) => string): string {
      const thenMatcher = Array.isArray(then)
        ? then.toString()
        : then.jasmineToString
        ? then.jasmineToString(pp)
        : 'unknown matcher';
      return `<an array starts with ${prefix} and then matches ${thenMatcher}>`;
    },
  };
}
