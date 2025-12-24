// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as childProcess from 'child_process';
import treeKill from 'tree-kill';
import {
  ExecOptions,
  ExecResult,
  AbnormalExitError,
  CancelledError,
  ProcessError,
  SudoError,
  ProcessEnv,
} from '../../shared/app/common/exec/types';
import * as shutil from '../../shared/app/common/shutil';

export function realExec(
  name: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult | Error> {
  return new Promise((resolve, _reject) => {
    if (options.logger) {
      options.logger.append(stringifyExecRequest(name, args, options));
    }

    const spawnOpts: childProcess.SpawnOptionsWithoutStdio = {
      cwd: options.cwd,
      env: constructEnv(options),
    };

    const command = childProcess.spawn(name, args, spawnOpts);
    if (options.pipeStdin) {
      command.stdin.write(options.pipeStdin);
      command.stdin.end();
    }

    command.stdout.setEncoding('utf-8');
    command.stderr.setEncoding('utf-8');

    let stdout = '';
    let stderr = '';
    let lastChar = '';
    command.stdout.on('data', (data: string) => {
      if (options.logger && options.logStdout) {
        options.logger.append(data);
        lastChar = data[data.length - 1];
      }
      stdout += data;
    });

    command.stderr.on('data', (data: string) => {
      if (options.logger) {
        options.logger.append(data);
        lastChar = data[data.length - 1];
      }
      stderr += data;
    });

    command.on('close', exitStatus => {
      if (options.logger && lastChar !== '' && lastChar !== '\n') {
        options.logger.append('\n');
      }
      if (!options.ignoreNonZeroExit && exitStatus !== 0) {
        if (
          exitStatus === 1 &&
          stderr.includes('sudo: no password was provided')
        ) {
          resolve(new SudoError(name, args, stdout, stderr));
        }
        resolve(new AbnormalExitError(name, args, exitStatus, stdout, stderr));
      }

      resolve({exitStatus, stdout, stderr});
    });

    // 'error' happens when the command is not available
    command.on('error', err => {
      if (options.logger && lastChar !== '' && lastChar !== '\n') {
        options.logger.append('\n');
      }
      resolve(new ProcessError(name, args, err));
    });

    if (options.cancellationToken !== undefined) {
      const cancel = () => {
        if (
          options.treeKillWhenCancelling !== true ||
          command.pid === undefined ||
          command.exitCode !== null
        ) {
          command.kill();
          resolve(new CancelledError(name, args));
        } else {
          treeKill(command.pid, err => {
            if (err) {
              // Fallback to just killing the command in case of an error.
              command.kill();
            }
            resolve(new CancelledError(name, args));
          });
        }
      };
      if (options.cancellationToken.isCancellationRequested) {
        cancel();
      } else {
        options.cancellationToken.onCancellationRequested(() => cancel());
      }
    }
  });
}

function constructEnv(options: ExecOptions): ProcessEnv | undefined {
  if (options.extraEnv) {
    return {
      ...process.env,
      ...options.extraEnv,
    };
  }
  return undefined;
}

/** Always-printed environment variables. */
export const ALLOWED_ENV_NAMES = Object.freeze([
  'HOME',
  'PATH',
  'PWD',
  'SHELL',
  'USER',
]);

/**
 * Stringify given exec request so that running it on shell would reproduce the same result.
 */
function stringifyExecRequest(
  name: string,
  args: string[],
  options: ExecOptions
): string {
  const tokens: string[] = [];
  if (options.cwd) {
    tokens.push(`cd ${options.cwd};`);
  }

  // Record modified and/or allowlisted environment variables.
  const loggedKeys = [];
  const usedEnv = constructEnv(options) ?? process.env;
  for (const key of Object.keys(usedEnv)) {
    const value = usedEnv[key];

    const modified = value !== process.env[key];
    const allowed = ALLOWED_ENV_NAMES.includes(key);

    if (modified || allowed) {
      loggedKeys.push(key);
    }
  }
  tokens.push('env', ...loggedKeys.sort().map(k => `${k}=${usedEnv[k]}`));

  tokens.push(shutil.escapeArray([name, ...args]));

  return tokens.join(' ') + '\n';
}
