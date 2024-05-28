// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {escapeArray} from '../shared/app/common/shutil';
import {execute} from './common';
import type {Summary} from '../src/test/unit/helpers/init_reporter';

/**
 * Script to root cause `npm run unit-test` flakiness.
 *
 * Usage: npx ts-node --swc tools/root_cause_flakiness.ts -p tools [--try N] [--record FILE]
 *
 *   The value of N is defaults to 10. The script first runs the unit tests without any filtering up
 *   to N times to confirm at least one attempt fails. After that it tries to shrink the number of
 *   test cases keeping the condition that at least one of them fails, by repeatedly randomly
 *   dividing the test cases into two parts and running each of them at most N times until it fails.
 *   If no attempt results in failure it reports the last command that failed and exits. Otherwise
 *   it repeats the shrinking process.
 *
 *   If FILE is specified, it dumps the latest failure summary to the file after its run. If FILE
 *   exists when it starts, it computes the initial tests to run from the file, and overwrite it
 *   when it finishes. It allows one to effectively resume the script with higher N.
 *
 *   It exits with non-zero value only if a test failure is detected.
 */

enum ExitCode {
  NoFailure = 0,
  GenericFailure = 1,
  RootCaused = 10,
}

const JASMINE_ENV = {
  NODE_OPTIONS: '-r source-map-support/register',
  NODE_PATH: 'out/src/test/unit/injected_modules',
};

type RunTestResult = Summary & {
  command: string[];
  extraEnv: Record<string, string>;
};

type Options = {
  /** The N value explained in the usage. */
  n: number;
  record?: string;
};

// https://stackoverflow.com/q/3561493
function escapeRegex(s: string) {
  return s.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

function makeFilter(specNames: string[]) {
  return '^(' + specNames.map(escapeRegex).join('|') + ')$';
}

// https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
function shuffle(a: unknown[]) {
  const n = a.length;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
}

class RootCauseFlakiness {
  private tempDir: string;
  constructor() {
    this.tempDir = fs.mkdtempSync(os.tmpdir() + '/');
    fs.mkdirSync(this.tempDir, {recursive: true});
  }

  private outputJsonNameStem = 1;
  private newOutputJson(): string {
    const stem = this.outputJsonNameStem++;
    return path.join(this.tempDir, `${stem}.json`);
  }

  private seed = 1;
  private newSeed(): number {
    return this.seed++;
  }

  private parseArgv(argv: string[]): Options {
    const opts: Options = {
      n: 10,
    };
    for (let i = 0; i < argv.length; ) {
      switch (argv[i++]) {
        case '--try':
          opts.n = Number(argv[i++]);
          break;
        case '--record':
          opts.record = argv[i++];
      }
    }
    return opts;
  }

  async run(argv: string[]): Promise<ExitCode> {
    const opts = this.parseArgv(argv);

    await this.buildTests();

    let failure = await this.initialFailure(opts);
    if (!failure) {
      console.log(`No failure found in ${opts.n} attempts`);
      return ExitCode.NoFailure;
    }

    while (failure.runSpecNames.length > 1) {
      const firstPartCount = Math.floor(failure.runSpecNames.length / 2);

      let failureFound = false;

      outer: for (let i = 0; i < opts.n; i++) {
        // Divide test cases into two parts and run each of them.

        const specs = [...failure.runSpecNames];
        shuffle(specs);

        for (const testCases of [
          specs.slice(0, firstPartCount),
          specs.slice(firstPartCount),
        ]) {
          const filter = makeFilter(testCases);

          const summary = await this.runUnitTest({
            seed: this.newSeed(),
            filter,
            failFast: true,
          });
          if (summary.failed) {
            failureFound = true;
            failure = summary;
            break outer;
          }
        }
      }

      if (!failureFound) {
        break;
      }

      if (opts.record) {
        await fs.promises.writeFile(
          opts.record,
          JSON.stringify(failure),
          'utf8'
        );
      }
    }

    // Update --filter option to reflect the specs actually have run until a failure.
    const command = [...failure.command];
    const filter = '--filter=' + makeFilter(failure.runSpecNames);
    const filterOptionIndex = command.findIndex(x => x.startsWith('--filter='));
    if (filterOptionIndex) {
      command[filterOptionIndex] = filter;
    } else {
      command.push(filter);
    }

    console.log(
      `Found ${
        failure.runSpecNames.length
      } specs running which results in failure. Command:
${escapeArray([
  'env',
  ...Object.entries(failure.extraEnv).map(([k, v]) => `${k}=${v}`),
  ...command,
])}`
    );

    return ExitCode.RootCaused;
  }

  private async initialFailure(
    opts: Options
  ): Promise<RunTestResult | undefined> {
    if (opts.record && fs.existsSync(opts.record)) {
      try {
        return JSON.parse(await fs.promises.readFile(opts.record, 'utf8'));
      } catch (e) {
        console.error(`Failed to parse ${opts.record}; ignoring it`);
      }
    }

    for (let i = 0; i < opts.n; i++) {
      const summary = await this.runUnitTest({
        seed: this.newSeed(),
        failFast: true,
      });

      if (summary.failed) {
        return summary;
      }
    }
  }

  private async buildTests() {
    await execute('npm', ['run', 'build-tests']);
  }

  private async runUnitTest(opts: {
    seed: number;
    filter?: string;
    failFast?: boolean;
  }): Promise<RunTestResult> {
    const output = this.newOutputJson();

    const extraEnv = {
      ...JASMINE_ENV,
      CHROMIUMIDE_UNIT_TEST_SUMMARY_OUTPUT: output,
    };
    // CLI options are documented on https://jasmine.github.io/setup/nodejs.html#cli-options.
    const command = [
      'npx',
      'jasmine',
      '--config=src/test/unit/jasmine.json',
      '--color',
      '--seed=' + opts.seed,
    ];
    if (opts.failFast) {
      command.push('--fail-fast');
    }
    if (opts.filter) {
      command.push('--filter=' + opts.filter);
    }

    await execute(command[0], command.slice(1), {
      extraEnv,
      logStdout: true,
      logStderr: true,
      noLogPrefix: true,
    }).catch(() => {});

    const summary: Summary = JSON.parse(
      await fs.promises.readFile(output, 'utf8')
    );
    return {
      ...summary,
      command,
      extraEnv,
    };
  }

  dispose() {
    fs.rmSync(this.tempDir, {recursive: true, force: true});
  }
}

const instance = new RootCauseFlakiness();

void (async () => {
  let exitCode;
  try {
    exitCode = await instance.run(process.argv);
  } catch (e) {
    console.error(e);
    exitCode = ExitCode.GenericFailure;
  }
  instance.dispose();
  // eslint-disable-next-line no-process-exit
  process.exit(exitCode);
})();
