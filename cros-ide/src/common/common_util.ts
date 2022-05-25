// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Common utilities between extension code and tools such as installtion
 * script. This file should not depend on 'vscode'.
 */

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode'; // import type definitions only
import * as shutil from './shutil';

// Type Chroot represents the path to chroot.
// We use nominal typing technique here. https://basarat.gitbook.io/typescript/main-1/nominaltyping
export type Chroot = string & {_brand: 'chroot'};
// Type Source represents the path to Chrome OS source.
export type Source = string & {_brand: 'source'};

export function isInsideChroot(): boolean {
  return isChroot('/');
}

export function isChroot(dir: string): boolean {
  return fs.existsSync(path.join(dir, '/etc/cros_chroot_version'));
}

/**
 * Returns the chroot in dir or its ancestor, or undefined on not found.
 */
export function findChroot(dir: string): Chroot | undefined {
  for (;;) {
    const chroot = path.join(dir, 'chroot');
    if (isChroot(chroot)) {
      return chroot as Chroot;
    }

    const d = path.dirname(dir);
    if (d === dir) {
      break;
    }
    dir = d;
  }
  // Check this after the for loop so that testing inside chroot works as
  // we want.
  if (isInsideChroot()) {
    return '/' as Chroot;
  }
  return undefined;
}

/**
 * Returns the Chrome OS source directory, given the path to chroot.
 */
export function sourceDir(chroot: Chroot): Source {
  if (chroot === '/') {
    return '/mnt/host/source' as Source;
  }
  return path.dirname(chroot) as Source;
}

class Task<T> {
  constructor(
    readonly job: () => Promise<T>,
    readonly resolve: (x: T | null) => void,
    readonly reject: (reason?: unknown) => void
  ) {}
  cancel() {
    this.resolve(null);
  }
  async run() {
    try {
      this.resolve(await this.job());
    } catch (e) {
      this.reject(e);
    }
  }
}

/**
 * JobManager manages jobs and ensures that only one job is run at a time. If
 * multiple jobs are in queue waiting for a running job, the manager cancels all
 * but the last job.
 */
export class JobManager<T> {
  // Queued tasks.
  private tasks: Task<T>[] = [];
  // True iff the a task is running.
  private running = false;

  constructor() {}

  /**
   * Pushes a job and returns a promise that is fulfilled after the job is
   * cancalled or completed. If the job is cancelled, the returned promise is
   * resolved with null.
   */
  offer(job: () => Promise<T>): Promise<T | null> {
    return new Promise((resolve, reject) => {
      this.tasks.push(new Task(job, resolve, reject));
      this.handle();
    });
  }

  private async handle(): Promise<void> {
    while (this.tasks.length > 1) {
      this.tasks.shift()!.cancel(); // cancel old tasks
    }
    if (this.running) {
      return;
    }
    const task = this.tasks.pop();
    if (!task) {
      return;
    }

    this.running = true;
    await task.run();
    this.running = false;
    await this.handle(); // handle possible new task
  }
}

export interface ExecResult {
  exitStatus: number | null;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  /** If true, stdout should be logged in addition to stderr, which is always logged. */
  logStdout?: boolean;

  /**
   * If the command exits with non-zero code, exec should return normally.
   * This changes the default behaviour, which is to return an error.
   */
  ignoreNonZeroExit?: boolean;

  /**
   * When set, pipeStdin is written to the stdin of the command.
   */
  pipeStdin?: string;

  /**
   * Allows interrupting a command execution.
   */
  cancellationToken?: vscode.CancellationToken;

  /**
   * Current working directory of the child process.
   */
  cwd?: string;
}

/**
 * Command was run, returned non-zero exit status,
 * and `exec` option was to return an error.
 */
export class AbnormalExitError extends Error {
  constructor(cmd: string, args: string[], exitStatus: number | null) {
    super(
      `"${shutil.escapeArray([
        cmd,
        ...args,
      ])}" failed, exit status: ${exitStatus}`
    );
  }
}

/**
 * Command did not run, for example, it was not found.
 */
export class ProcessError extends Error {
  constructor(cmd: string, args: string[], cause: Error) {
    // Chain errors with `cause` option is not available.
    super(`"${shutil.escapeArray([cmd, ...args])}" failed: ${cause.message}`);
  }
}

/**
 * Command execution was interrupted with vscode.CancellationToken.
 */
export class CancelledError extends Error {
  constructor(cmd: string, args: string[]) {
    super(`"${shutil.escapeArray([cmd, ...args])}" cancelled`);
  }
}

export type Log = (line: string) => void;

/**
 * Executes command with optionally logging its output. The promise will be
 * resolved with outputs of the command or an Error. It's guaranteed that
 * data passed to log ends with a newline.
 *
 * Errors are **always returned** and **never thrown**. If the underlying call to
 * childProcess.spawn returns and error, then we return it.
 * If the command terminates with non-zero exit status then we return `ExecutionError`
 * unless `ignoreNonZeroExit` was set.
 *
 * @param log Optional logging function.
 * @param opt Optional parameters. See `ExecOptions` for the description.
 */
export function exec(
  name: string,
  args: string[],
  log?: Log,
  opt?: ExecOptions
): Promise<ExecResult | Error> {
  return execPtr(name, args, log, opt);
}

let execPtr = realExec;

/**
 * Tests shouldn't directly call this function. Use installFakeExec instead.
 */
export function setExecForTesting(fakeExec: typeof exec): () => void {
  const original = execPtr;
  execPtr = fakeExec;
  return () => {
    execPtr = original;
  };
}

function realExec(
  name: string,
  args: string[],
  log?: (line: string) => void,
  opt?: ExecOptions
): Promise<ExecResult | Error> {
  return new Promise((resolve, _reject) => {
    if (log) {
      log(shutil.escapeArray([name, ...args]) + '\n');
    }

    const spawnOpts: childProcess.SpawnOptionsWithoutStdio = {};
    if (opt?.cwd) {
      spawnOpts.cwd = opt.cwd;
    }

    const command = childProcess.spawn(name, args, spawnOpts);
    if (opt?.pipeStdin) {
      command.stdin.write(opt.pipeStdin);
      command.stdin.end();
    }

    let remainingStdout = '';
    let remainingStderr = '';
    let stdout = '';
    let stderr = '';
    command.stdout.on('data', data => {
      if (log && opt && opt.logStdout) {
        remainingStdout += data;
        const i = remainingStdout.lastIndexOf('\n');
        log(remainingStdout.substring(0, i + 1));
        remainingStdout = remainingStdout.substring(i + 1);
      }
      stdout += data;
    });

    command.stderr.on('data', data => {
      if (log) {
        remainingStderr += data;
        const i = remainingStderr.lastIndexOf('\n');
        log(remainingStderr.substring(0, i + 1));
        remainingStderr = remainingStderr.substring(i + 1);
      }
      stderr += data;
    });

    command.on('close', exitStatus => {
      if (log && opt && opt.logStdout && remainingStdout) {
        log(remainingStdout + '\n');
      }
      if (log && remainingStderr) {
        log(remainingStderr + '\n');
      }
      if (!(opt && opt.ignoreNonZeroExit) && exitStatus !== 0) {
        resolve(new AbnormalExitError(name, args, exitStatus));
      }

      resolve({exitStatus, stdout, stderr});
    });

    // 'error' happens when the command is not available
    command.on('error', err => {
      resolve(new ProcessError(name, args, err));
    });

    if (opt?.cancellationToken !== undefined) {
      const cancel = () => {
        command.kill();
        resolve(new CancelledError(name, args));
      };
      if (opt.cancellationToken.isCancellationRequested) {
        cancel();
      } else {
        opt.cancellationToken.onCancellationRequested(cancel);
      }
    }
  });
}

export async function withTempDir(
  f: (tempDir: string) => Promise<void>
): Promise<void> {
  let td: string | undefined;
  try {
    td = await fs.promises.mkdtemp(os.tmpdir() + '/');
    await f(td);
  } finally {
    if (td) {
      await fs.promises.rmdir(td, {recursive: true});
    }
  }
}

/**
 * Takes possibly blocking Thenable f and timeout millis, and returns a Thenable that is fulfilled
 * with f's value or undefined in case f doesn't return before the timeout.
 */
export function withTimeout<T>(
  f: Thenable<T>,
  millis: number
): Thenable<T | undefined> {
  return Promise.race([
    f,
    new Promise<undefined>(resolve =>
      setTimeout(() => resolve(undefined), millis)
    ),
  ]);
}
