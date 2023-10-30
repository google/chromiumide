// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import * as depotTools from '../../common/depot_tools';
import {LineBufferedOutputAdapter} from '../../common/line_buffered_output_adapter';
import * as config from '../../services/config';

type PickedOutputChannel = Pick<vscode.OutputChannel, 'append'>;

/**
 * Filters compile progress lines of the output so that very large compiles don't spam the terminal
 * with 10000s of lines, because this is very slow when using VSCode remotely and makes the editor
 * unresponsive.
 *
 * All lines that begin with `[<done>/<total>]` where `total - done > 200`, are filtered and not
 * shown. Instead, we show lines like `Compile progress: 23.48% (<done>/<total>)` at most every
 * 500ms.
 */
class AutoninjaOutputAdapter {
  static create(output: PickedOutputChannel): LineBufferedOutputAdapter {
    return new LineBufferedOutputAdapter(new AutoninjaOutputAdapter(output));
  }

  private readonly PROGRESS_INTERVAL = 500;

  private lastProgressDisplayTime = 0;

  private constructor(private readonly output: PickedOutputChannel) {}

  append(line: string): void {
    const absoluteProgress = this.parseProgress(line);
    if (!absoluteProgress) {
      // Pass-through non-progress lines as is (e.g., build errors).
      this.output.append(line);
      return;
    }

    const {total, done} = absoluteProgress;
    if (total - done <= 200) {
      // If less than 200 commands remain, simply show them.
      this.output.append(line);
      return;
    }

    // Show progress at most every 500ms.
    const now = Date.now();
    if (now - this.lastProgressDisplayTime >= this.PROGRESS_INTERVAL) {
      const donePercentage = ((done / total) * 100).toFixed(2);
      this.output.append(
        '\u001b[K' + // clear line
          `Compile progress: ${donePercentage}% (${done}/${total})` +
          '\r' // return to start of line
      );
      this.lastProgressDisplayTime = now;
    }
  }

  private parseProgress(line: string) {
    const match = line.match(/^\[([0-9]+)\/([0-9]+)\]/);
    return match ? {done: Number(match[1]), total: Number(match[2])} : null;
  }
}

export async function runAutoninja(
  args: string[],
  cwd: string,
  output: Pick<vscode.OutputChannel, 'append'>,
  cancellationToken: vscode.CancellationToken
): Promise<Error | void> {
  // For now, we'll allow users to opt out of the new progress implementation in case of unforeseen
  // problems.
  const logger = config.underDevelopment.autoninjaImprovements.get()
    ? AutoninjaOutputAdapter.create(output)
    : output;
  const result = await commonUtil.exec('autoninja', args, {
    cancellationToken,
    cwd,
    logger,
    logStdout: true,
    treeKillWhenCancelling: config.underDevelopment.autoninjaImprovements.get(),
    env: {
      ...depotTools.envForDepotTools(),

      // Force ninja status line format in case the user has overwritten it (used in
      // `AutoninjaOutputAdapter` to track compile progress).
      // https://ninja-build.org/manual.html#_environment_variables
      NINJA_STATUS: '[%f/%t] ',

      // Force ninja to use colored output for things like error messages.
      // https://github.com/ninja-build/ninja/issues/2196#issuecomment-1262923451
      // https://github.com/ninja-build/ninja/blob/36843d387cb0621c1a288179af223d4f1410be73/src/line_printer.cc#L60-L63
      CLICOLOR_FORCE: '1',
    },
  });
  // TODO(cmfcmf): Unconditionally call `flush` once
  // `config.underDevelopment.autoninjaImprovements` is removed.
  if (logger instanceof LineBufferedOutputAdapter) {
    logger.flush();
  }
  if (result instanceof Error) {
    return result;
  }
}

export const TEST_ONLY = {AutoninjaOutputAdapter};
