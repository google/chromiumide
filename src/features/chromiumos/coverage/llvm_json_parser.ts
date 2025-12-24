// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  LlvmFileCoverage,
  Segment,
  startLine,
  execCount,
  hasExecCount,
  isRegionEntry,
  isGapRegion,
} from './types';

// This file contains an algorithm to transform LLVM based coverage data,
// to a line based format suitable for displaying in VSCode.
//
// It is based on CodeSearch Go code and keeps names and structure of
// the code similar.

/** Coverage data converted from LLVM's format to line-base format. */
export interface LineCoverage {
  filename: string;

  /** Covered lines as a list of 1-based line numbers. */
  covered: number[];

  /** Uncovered lines as a list of 1-based line numbers. */
  uncovered: number[];
}

interface FileExecCount {
  filename: string;

  /**
   * Maps instrumented lines to their execution count.
   * Lines with execution count = 0 are uncovered.
   * If a line is not present, it was not instrumented.
   */
  execCount: number[];
}

export function llvmToLineFormat(f: LlvmFileCoverage): LineCoverage {
  if (!f.segments.length) {
    return {
      filename: f.filename,
      covered: [],
      uncovered: [],
    };
  }

  const data: FileExecCount = {
    filename: f.filename,
    execCount: [],
  };

  // Last segment that starts in the previous line.
  let wrappedSeg: Segment | undefined;

  // Points to segments that are still left to process.
  let segmentsToProcess = f.segments;
  const lastLine = segmentsToProcess[segmentsToProcess.length - 1][startLine];

  // Iterate over lines and process relevant segments for each line.
  // The sequence of segments is sorted by startLine and startColumn,
  // which allows for processing them in order.
  // Segments don't have end locations, so their end is marked
  // by the beginning of the next Segment.
  for (let i = 1; i <= lastLine; i++) {
    // Calculate the execution count for each line, following the logic in llvm-cov:
    // https://github.com/llvm/llvm-project/blob/bfc6d8b59b7b3f736f43ba16666c1f7ed9c780e4/llvm/lib/ProfileData/Coverage/CoverageMapping.cpp#L741

    const curLineSegs = getSegmentsInLine(segmentsToProcess, i);
    // Pop the current line segments from those that are still left to process.
    segmentsToProcess = segmentsToProcess.slice(curLineSegs.length);

    // Only calculate for coverable lines.
    if (isCoverableRegion(curLineSegs, wrappedSeg)) {
      data.execCount[i] = computeLineExecCount(curLineSegs, wrappedSeg);
    }

    // If there were any segments in the line, update the wrapped segment
    // to the last one from the current line.
    if (curLineSegs.length > 0) {
      wrappedSeg = curLineSegs[curLineSegs.length - 1];
    }
  }

  return toLineFormat(data);
}

// getSegmentsInLine returns those segments from the list that start in line.
// The 'segments' is assumed to be sorted by startLine.
function getSegmentsInLine(segments: Segment[], line: number): Segment[] {
  const lineSegs: Segment[] = [];
  for (const s of segments) {
    if (s[startLine] > line) {
      // Segments are sorted, so we can return early.
      return lineSegs;
    } else if (s[startLine] === line) {
      lineSegs.push(s);
    }
  }
  return lineSegs;
}

function computeLineExecCount(
  lineSegs: Segment[],
  wrappedSeg?: Segment
): number {
  // The final line exec count is the maximum of:
  //   a. exec count of the wrapped segment (if exists),
  //   b. maximum exec count among all non-gap, region entry segments in the current line.
  let count = 0;
  if (wrappedSeg) {
    count = wrappedSeg[execCount];
  }
  for (const s of lineSegs) {
    if (isStartOfInstrumentedRegion(s) && s[execCount] > count) {
      count = s[execCount];
    }
  }
  return count;
}

function isCoverableRegion(lineSegs: Segment[], wrappedSeg?: Segment): boolean {
  // Region is coverable, when:
  //   a. it is not starting a skipped region AND
  //   b. it starts a new region OR the wrapped segment from the previous line is coverable
  //      (i.e. this line is a continuation of a coverable region).
  //
  // Ref: https://github.com/llvm-mirror/llvm/blob/3b35e17b21e388832d7b560a06a4f9eeaeb35330/lib/ProfileData/Coverage/CoverageMapping.cpp#L700
  // If the first segment in the line is Skipped, the line gets no execution
  // count set (regardless of the remaining segments in the line).
  return (
    !isStartOfSkippedRegion(lineSegs) &&
    ((wrappedSeg && wrappedSeg[hasExecCount]) ||
      hasStartOfNewInstrumentedRegion(lineSegs))
  );
}

function isStartOfSkippedRegion(s: Segment[]): boolean {
  // A region is skipped if HasExecCount is false.
  //  Here we also check if it's a region entry.
  return s.length > 0 && !s[0][hasExecCount] && s[0][isRegionEntry];
}

function isStartOfInstrumentedRegion(s: Segment): boolean {
  return s && s[hasExecCount] && s[isRegionEntry];
}

function hasStartOfNewInstrumentedRegion(lineSegs: Segment[]): boolean {
  for (const s of lineSegs) {
    if (!s[isGapRegion] && isStartOfInstrumentedRegion(s)) {
      return true;
    }
  }
  return false;
}

/** Convert execution counts per line to a format convenint for display. */
function toLineFormat(data: FileExecCount): LineCoverage {
  const covered: number[] = [];
  const uncovered: number[] = [];
  for (const [line, exec] of data.execCount.entries()) {
    if (exec !== undefined && exec !== null) {
      (exec > 0 ? covered : uncovered).push(line);
    }
  }
  return {
    filename: data.filename,
    covered,
    uncovered,
  };
}

export const TEST_ONLY = {isCoverableRegion};
