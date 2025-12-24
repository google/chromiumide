// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as dateFns from 'date-fns';
import {Sink} from './sink';

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
  pathArrayMap: PathMap<readonly T[]>,
  groupBy: (arg: T) => Key
): Map<Key, PathMap<T[]>> {
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
  return res;
}

/**
 * Convert UTC timestamp returned by Gerrit into a localized human fiendly format.
 *
 * Sample input: '2022-09-27 09:25:04.000000000'
 */
export function formatGerritTimestamp(timestamp: string): string {
  try {
    // The input is UTC, but before we can parse it, we need to adjust
    // the format by replacing '.000000000' at the end with 'Z'
    // ('Z' tells date-fns that it's UTC time).
    const timestampZ: string = timestamp.replace(/\.[0-9]*$/, 'Z');
    const date: Date = dateFns.parse(
      timestampZ,
      'yyyy-MM-dd HH:mm:ssX',
      new Date()
    );
    // Date-fns functions use the local timezone.
    if (dateFns.isToday(date)) {
      return dateFns.format(date, 'HH:mm'); // e.g., 14:27
    } else if (dateFns.isThisYear(date)) {
      return dateFns.format(date, 'MMM d'); // e.g., Sep 5
    } else {
      return dateFns.format(date, 'yyyy MMM d'); // e.g., 2019 Aug 15
    }
  } catch (err) {
    // Make sure not to throw any errors, because then
    // the comments may not be shown at all.
    return timestamp;
  }
}
/** Removes sensitive data from a string sent to metrics. */
// This function is a part of gerrit package, not metrics,
// because it's easier to test it here.
// TODO(ttylenda): Move this logic to metrics package.
function redactPII(input: string): string {
  const user = os.userInfo().username;
  return input.replace(new RegExp(user, 'g'), '${USER}');
}

export function showTopLevelError(err: Error, sink: Sink): void {
  const redacted = redactPII(`${err}`);
  sink.show({
    log: `Failed to show Gerrit changes: ${err}`,
    metrics: 'Failed to show Gerrit changes (top-level): ' + redacted,
  });
}
