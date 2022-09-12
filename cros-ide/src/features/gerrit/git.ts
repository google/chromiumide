// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export type Hunk = {
  originalStartLine: number;
  originalLineSize: number;
  currentStartLine: number;
  currentLineSize: number;
};

/**
 * Parses the output of `git diff -U0` and returns hunks.
 */
export function getHunk(gitDiffContent: string): Hunk[] {
  const gitDiffRegex = /@@ -([0-9]*)[,]?([0-9]*) \+([0-9]*)[,]?([0-9]*) @@/gm;
  const hunks: Hunk[] = [];
  let range: RegExpExecArray | null;
  while ((range = gitDiffRegex.exec(gitDiffContent)) !== null) {
    const hunk: Hunk = {
      originalStartLine: Number(range[1]),
      originalLineSize: Number(range[2]),
      currentStartLine: Number(range[3]),
      currentLineSize: Number(range[4]),
    };
    hunks.push(hunk);
  }
  return hunks;
}
