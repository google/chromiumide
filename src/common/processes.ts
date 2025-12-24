// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {pollUntil} from './poll';

const DEFAULT_TIMEOUT = {SIGTERM: 10_000, SIGKILL: 5_000};
const DEFAULT_INTERVAL = 500;

/**
 * Kills the process showing the progress to the user. It first sends SIGTERM to the process, and if
 * the process still exists after timeout, sends SIGKILL. Returns whether the process was killed.
 *
 * Timeouts for SIGTERM and SIGKILL can be customized with `opts.timeout`, and if the number is
 * negative, the corresponding signal will never be sent. The interval between polling to test the
 * process has been killed can be customized with `opts.interval`. Default timeouts (10s for SIGTERM
 * and 5s for SIGKILL) and interval (500ms) are used if `opts.timeout` and `opts.interval` are not
 * specified respectively.
 */
export async function killGracefully(
  proc: {pid: number; name?: string},
  opts?: {
    output?: vscode.OutputChannel;
    timeout?: {
      SIGTERM: number;
      SIGKILL: number;
    };
    interval?: number;
  }
): Promise<boolean> {
  const name = proc.name ? `${proc.name}[${proc.pid}]` : proc.pid.toString();

  const timeouts = opts?.timeout ?? DEFAULT_TIMEOUT;
  const interval = opts?.interval ?? DEFAULT_INTERVAL;

  const killed = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Killing ${name}`,
      cancellable: true,
    },
    async (progress, token) => {
      for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
        const timeout = timeouts[signal];
        if (timeout < 0) continue;

        progress.report({message: `Sending ${signal}`});

        try {
          process.kill(proc.pid, signal);
        } catch (e) {
          opts?.output?.appendLine(`Failed to send ${signal} to ${name}: ${e}`);
          return false;
        }

        const extraMessage =
          signal === 'SIGTERM' && timeouts['SIGKILL'] >= 0
            ? ' (after the timeout SIGKILL will be sent)'
            : '';

        progress.report({
          message:
            `Waiting until ${name} handles ${signal} and exits for ${
              timeout / 1000
            }s` + extraMessage,
        });

        const killed = await pollUntil(
          () => !processExists(proc.pid),
          {interval, timeout},
          token
        );
        if (killed) return true;
        if (token.isCancellationRequested) return false;
      }
      return false;
    }
  );
  if (killed) {
    void vscode.window.showInformationMessage(`Killed ${name}`);
  } else {
    void vscode.window.showErrorMessage(`Failed to kill ${name}`);
  }
  return killed;
}

export function processExists(pid: number): boolean {
  try {
    // A signal of `0` can be used to test for the existence of a process.
    process.kill(pid, 0);
    return true;
  } catch (_e) {
    return false;
  }
}
