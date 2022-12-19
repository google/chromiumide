// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** Map from the file path to T */
export type PathMap<T> = {
  [filePath: string]: T;
};

/**
 * Splits a JS object, representing a map from string to T[],
 * into multiple objects. Splitting is done based on the groupBy function.
 *
 * For example:
 * {
 *   'a.cc': [1, 1, 2],
 *   'b.cc': [2, 3, 3],
 * }
 *
 * with identity as a grouping functions will be split into as follows:
 *   1 -> { 'a.cc': [1, 1] }
 *   2 -> { 'a.cc': [2], 'b.cc': [2] }
 *   3 -> { 'b.cc': [3, 3] }
 *
 * See the unit tests for another example.
 */
export function splitPathArrayMap<T, Key>(
  pathArrayMap: PathMap<T[]>,
  groupBy: (arg: T) => Key
): [Key, PathMap<T[]>][] {
  const res = new Map<Key, PathMap<T[]>>();
  for (const [filePath, xs] of Object.entries(pathArrayMap)) {
    for (const x of xs) {
      const key = groupBy(x);
      let splitObj = res.get(key);
      if (!splitObj) {
        splitObj = {};
        res.set(key, splitObj);
      }
      if (filePath in splitObj) {
        splitObj[filePath].push(x);
      } else {
        splitObj[filePath] = [x];
      }
    }
  }
  return [...res.entries()];
}
