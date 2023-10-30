// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {
  LineCoverage,
  llvmToLineFormat,
  TEST_ONLY,
} from '../../../../../features/chromiumos/coverage/llvm_json_parser';
import {
  LlvmFileCoverage,
  Segment,
} from '../../../../../features/chromiumos/coverage/types';

const {isCoverableRegion} = TEST_ONLY;

// Based on CodeSeearch tests.

/*
 * Example from https://llvm.org/docs/CoverageMappingFormat.html#mapping-region

 * 1  int main(int argc, const char *argv[]) {  // Code Region from 1:40 to 9:2 - exec count: 2
 * 2
 * 3    if (argc > 1) {                         // Code Region from 3:17 to 5:4 - exec count: 2
 * 4      printf("%s\n", argv[1]);
 * 5    } else {                                // Code Region from 5:10 to 7:4 - exec count: 0
 * 6      printf("\n");
 * 7    }
 * 8    return 0;
 * 9  }

 * This should yield the following segments:

 *   <startLine, startColumn, execCount, instrumented, isRegionEntry, isGapRegion>

 *   [1, 40, 2, true,  true,  false] - instrumented, regionStart, not gap
 *   [3, 17, 2, true,  true,  false] - instrumented, regionStart, not gap
 *   [5,  4, 2, true,  false, false] - instrumented, NOT regionStart ('else' is a continuation of the first block with the 'if'), not gap
 *   [5, 10, 0, true,  true,  false] - instrumented, regionStart (the contents of the 'else' block), not gap
 *   [7,  4, 2, true,  false, false] - instrumented, NOT regionStart (continuation of the first block), not gap
 *   [9,  1, 0, false, false, false] - [final record] not instrumented, not start, not gap

 * Hence the lines 1-5 are covered, 6-7 uncovered, 8-9 again covered.
 */

describe('Coverage parser', () => {
  it('correctly parses covered and not covered lines', () => {
    const testCases: {
      input: LlvmFileCoverage;
      want: LineCoverage;
    }[] = [
      {
        input: {
          filename: 'example/file.cc',
          segments: [
            [1, 40, 2, true, true, false],
            [3, 17, 2, true, true, false],
            [5, 4, 2, true, false, false],
            [5, 10, 0, true, true, false],
            [7, 4, 2, true, false, false],
            [9, 1, 0, false, false, false],
          ],
        },
        want: {
          filename: 'example/file.cc',
          covered: [1, 2, 3, 4, 5, 8, 9],
          uncovered: [6, 7],
        },
      },
      {
        input: {
          filename: 'example/another.cc',
          segments: [
            [1, 10, 2, true, true, false],
            [3, 20, 0, true, true, false],
            [5, 1, 0, false, false, false],
          ],
        },
        want: {
          filename: 'example/another.cc',
          covered: [1, 2, 3],
          uncovered: [4, 5],
        },
      },
      {
        input: {
          filename: 'example/with_skipped_line.cc',
          segments: [
            [1, 10, 2, true, true, false],
            [3, 10, 0, false, true, false],
            [3, 20, 4, true, true, false],
            [4, 5, 4, true, false, false],
            [5, 1, 0, false, false, false],
          ],
        },
        want: {
          filename: 'example/with_skipped_line.cc',
          covered: [1, 2, 4, 5],
          uncovered: [], // line 3 is not instrumented - hence not uncovered.
        },
      },
      {
        /*
         * Data collected from the following program
         * (a modified example from the Clang Source-based Code Coverage page
         * (https://clang.llvm.org/docs/SourceBasedCodeCoverage.html)):
         *
         *      Line Count
         *       1   30     #define BAR(x) ((x) || (x))
         *       2   3      template <typename T> void foo(T x) {
         *       3   33       for (unsigned I = 0; I < 10; ++I) { BAR(I); }
         *       4   3      }
         *       5   1      int main() {
         *       6   1        foo<int>(0);
         *       7   1        foo<float>(0);
         *       8   1        int a = 1;
         *       9   1        if (a > 5) {
         *      10   0          foo<float>(1);
         *      11   0        }
         *      12   1        if (++a > 1 || a < 5) {
         *      13   1          foo<float>(2);
         *      14   1        }
         *      15   1        return 0;
         *      16   1      }
         */
        input: {
          filename: 'example/long.cc',
          segments: [
            [1, 16, 30, true, true, false],
            [1, 17, 30, true, true, false],
            [1, 20, 30, true, false, false],
            [1, 24, 3, true, true, false],
            [1, 27, 30, true, false, false],
            [1, 28, 0, false, false, false],
            [2, 37, 3, true, true, false],
            [3, 24, 33, true, true, false],
            [3, 30, 3, true, false, false],
            [3, 32, 30, true, true, false],
            [3, 35, 3, true, false, false],
            [3, 36, 30, true, false, true],
            [3, 37, 30, true, true, false],
            [3, 39, 30, true, true, false],
            [3, 42, 30, true, false, false],
            [3, 48, 3, true, false, false],
            [4, 2, 0, false, false, false],
            [5, 12, 1, true, true, false],
            [9, 7, 1, true, true, false],
            [9, 12, 1, true, false, false],
            [9, 13, 0, true, false, true],
            [9, 14, 0, true, true, false],
            [11, 4, 1, true, false, false],
            [12, 7, 1, true, true, false],
            [12, 14, 1, true, false, false],
            [12, 18, 0, true, true, false],
            [12, 23, 1, true, false, false],
            [12, 25, 1, true, true, false],
            [14, 4, 1, true, false, false],
            [16, 2, 0, false, false, false],
          ],
        },
        want: {
          filename: 'example/long.cc',
          covered: [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16],
          uncovered: [10, 11],
        },
      },
    ];
    for (const {input, want} of testCases) {
      const output = llvmToLineFormat(input);
      expect(output).withContext(input.filename).toEqual(want);
    }
  });

  /*
   *    1|       |#include <cstdio>
   *    2|       |
   *    3|      1|int main() {
   *    4|       |  // Multi-line
   *    5|       |  // comment
   *    6|       |  // for
   *    7|       |  // testing
   *    8|      1|  if (true) {
   *    9|      1|    printf("true\n");
   *   10|      1|  } else {
   *   11|      0|    printf("false\n");
   *   12|      0|  }
   *   13|      1|}
   */
  it('correctly handle multi-line comments', () => {
    const input: LlvmFileCoverage = {
      filename: 'test/main.cc',
      segments: [
        [3, 12, 1, true, true, false],
        [4, 1, 0, false, true, false],
        [7, 13, 1, true, false, false],
        [8, 7, 1, true, true, false],
        [8, 11, 1, true, false, false],
        [8, 13, 1, true, true, false],
        [10, 4, 0, true, false, true],
        [10, 10, 0, true, true, false],
        [12, 4, 1, true, false, false],
        [13, 2, 0, false, false, false],
      ],
    };
    const want: LineCoverage = {
      filename: 'test/main.cc',
      covered: [3, 8, 9, 10, 13],
      uncovered: [11, 12],
    };
    expect(llvmToLineFormat(input)).toEqual(want);
  });

  it('handles an empty input', () => {
    const input: LlvmFileCoverage = {
      filename: 'empty/coverage.cc',
      segments: [],
    };
    const want: LineCoverage = {
      filename: 'empty/coverage.cc',
      covered: [],
      uncovered: [],
    };
    expect(llvmToLineFormat(input)).toEqual(want);
  });

  it('isCoverableRegion', () => {
    const tests: {
      name: string;
      wrappedSeg?: Segment;
      lineSegs?: Segment[];
      want: boolean;
    }[] = [
      {
        name: 'no line segments + no wrapped segment - NOT coverable',
        wrappedSeg: undefined,
        want: false,
      },
      {
        name: 'no line segments + an *instrumented* wrapped segment that is a region entry - coverable',
        wrappedSeg: [5, 10, 15, true, true, false],
        want: true,
      },
      {
        name: 'no line segments + an *instrumented* wrapped segment that is NOT a region entry - coverable',
        wrappedSeg: [5, 10, 15, true, false, false],
        want: true,
      },
      {
        name: 'no segments in the line and a *NOT instrumented* wrapped segment - NOT coverable',
        wrappedSeg: [5, 10, 15, false, false, false],
        want: false,
      },
      {
        name: 'line segments start with a skipped region (no exec count + region entry) - NOT coverable',
        lineSegs: [
          // Skipped segment.
          [6, 10, 0, false, true, false],
          // Another segment - ignored.
          // Ref: https://github.com/llvm-mirror/llvm/blob/3b35e17b21e388832d7b560a06a4f9eeaeb35330/lib/ProfileData/Coverage/CoverageMapping.cpp#L700
          [6, 15, 15, true, true, false],
        ],
        want: false,
      },
      {
        name: 'line segments start a new instrumented region + no wrapped segment - coverable',
        lineSegs: [
          // Starts a new instrumented region.
          [6, 10, 2, true, true, false],
          [6, 15, 15, true, false, false],
        ],
        want: true,
      },
      {
        name: 'line segments *continue* an instrumented region + an *instrumented* wrapped segment - coverable',
        wrappedSeg: [5, 10, 15, true, false, false],
        lineSegs: [
          // Continues an instrumented region.
          [6, 10, 2, true, false, false],
          [6, 15, 15, true, true, false],
        ],
        want: true,
      },
      {
        name: 'line segment is a Gap region + no wrapped segment - NOT coverable',
        lineSegs: [
          // Starts a Gap region.
          [6, 10, 2, false, false, true],
        ],
        want: false,
      },
    ];
    for (const tt of tests) {
      expect(isCoverableRegion(tt.lineSegs ?? [], tt.wrappedSeg))
        .withContext(tt.name)
        .toEqual(tt.want);
    }
  });
});
