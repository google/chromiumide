// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';

/**
 * Summary is output to the filepath if the environment variable is set.
 */
const {CHROMIUMIDE_UNIT_TEST_SUMMARY_OUTPUT} = process.env as Record<
  string,
  string
>;

export type Summary = {
  runSpecNames: string[];
  failed: boolean;
};

// Custom reporter to output summary after tests run.
// https://jasmine.github.io/tutorials/custom_reporter
class Reporter implements jasmine.CustomReporter {
  private summary: Summary = {
    runSpecNames: [],
    failed: false,
  };

  specDone(result: jasmine.SpecResult, done?: () => void) {
    if (result.status !== 'excluded') {
      this.summary.runSpecNames.push(result.fullName);
    }
    if (result.status === 'failed') {
      this.summary.failed = true;
    }
    done?.();
  }

  suiteDone(result: jasmine.SuiteResult, done?: () => void) {
    if (result.status === 'failed') {
      this.summary.failed = true;
    }
    done?.();
  }

  jasmineDone(_runDetails: jasmine.JasmineDoneInfo, done?: () => void) {
    const out = CHROMIUMIDE_UNIT_TEST_SUMMARY_OUTPUT;

    fs.mkdirSync(path.dirname(out), {recursive: true});
    fs.writeFileSync(out, JSON.stringify(this.summary), 'utf8');

    done?.();
  }
}

if (CHROMIUMIDE_UNIT_TEST_SUMMARY_OUTPUT) {
  jasmine.getEnv().addReporter(new Reporter());
}
