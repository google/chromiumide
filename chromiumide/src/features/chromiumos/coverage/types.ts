// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** Top-level element in `coverage.json` */
export interface CoverageJson {
  // Only data[0] appears to be used.
  data: {
    files: LlvmFileCoverage[];
  }[];
}

/** Coverage per file from `coverage.json` */
export interface LlvmFileCoverage {
  filename: string;
  segments: Segment[];
}

/** LLVM's coverage format. */
export type Segment = [
  /** The line where this segment begins. */
  startLine: number,

  /** The column where this segment begins. */
  startColumn: number,

  /** The execution count, or zero if no count was recorded. */
  execCount: number,

  /** When false, the segment was uninstrumented or skipped. */
  hasExecCount: boolean,

  /** Whether this enters a new region or returns to a previous count. */
  isRegionEntry: boolean,

  isGapRegion?: boolean
];

// Names in the named tuple cannot be used for accessing fields :(

/** Identifies a field in `Segment`. */
export const startLine = 0;

/** Identifies a field in `Segment`. */
export const execCount = 2;

/** Identifies a field in `Segment`. */
export const hasExecCount = 3;

/** Identifies a field in `Segment`. */
export const isRegionEntry = 4;

/** Identifies a field in `Segment`. */
export const isGapRegion = 5;
