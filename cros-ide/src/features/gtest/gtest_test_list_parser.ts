// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Parses output from a gtest executable run with the --gtest_list_tests flag
 * and returns the strings in the form of "<suite>.<name>". The return value may
 * contain duplicate elements for parameterized tests.
 */
export function parse(stdout: string): string[] {
  const res = [];
  let suite = '';
  for (let line of stdout.trim().split('\n')) {
    // Some lines may end with a comment that begins with `#`.
    const commentIdx = line.indexOf('#');
    if (commentIdx > -1) {
      line = line.slice(0, commentIdx);
    }

    if (line.startsWith('  ')) {
      res.push(suite + line.trim().split('/')[0]);
    } else {
      line = line.trim();
      if (line.includes('/')) {
        suite = line.split('/')[1];
      } else {
        suite = line;
      }
    }
  }
  return res;
}
