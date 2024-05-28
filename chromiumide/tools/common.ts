// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as childProcess from 'child_process';
import * as shutil from '../shared/app/common/shutil';

/**
 * Executes the command
 * @throws if it exits with non-zero exit status.
 */
export async function execute(
  name: string,
  args: string[],
  opts?: {
    logStdout?: boolean;
    logStderr?: boolean;
    cwd?: string;
    extraEnv?: Record<string, string>;
    noLogPrefix?: boolean;
  }
): Promise<string> {
  const {logStdout, logStderr, cwd} = opts || {};
  const logger = new (class {
    append(s: string) {
      process.stdout.write(s);
    }
  })();

  return new Promise((resolve, reject) => {
    logger.append(shutil.escapeArray([name, ...args]) + '\n');

    const command = childProcess.spawn(name, args, {
      cwd,
      env: {
        ...process.env,
        ...(opts?.extraEnv ?? {}),
      },
    });

    command.stdout.setEncoding('utf-8');
    command.stderr.setEncoding('utf-8');

    let stdout = '';
    let lastChar = '';
    command.stdout.on('data', (data: string) => {
      if (logStdout) {
        const prefix = opts?.noLogPrefix ? '' : 'STDOUT: ';
        logger.append(prefix + data);
        lastChar = data[data.length - 1];
      }
      stdout += data;
    });
    command.stderr.on('data', (data: string) => {
      if (logStderr) {
        const prefix = opts?.noLogPrefix ? '' : 'STDERR: ';
        logger.append(prefix + data);
      }
    });

    command.on('close', exitStatus => {
      if (logger && lastChar !== '' && lastChar !== '\n') {
        logger.append('\n');
      }
      if (exitStatus !== 0) {
        reject(
          new Error(
            `"${shutil.escapeArray([
              name,
              ...args,
            ])}" failed, exit status: ${exitStatus}`
          )
        );
      }

      resolve(stdout);
    });

    // 'error' happens when the command is not available
    command.on('error', err => {
      if (logger && lastChar !== '' && lastChar !== '\n') {
        logger.append('\n');
      }
      reject(
        new Error(
          `"${shutil.escapeArray([name, ...args])}" failed: ${err.message}`
        )
      );
    });
  });
}
