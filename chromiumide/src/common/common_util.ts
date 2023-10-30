// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Common utilities between extension code and tools such as installation
 * script. This file should not depend on 'vscode'.
 */

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import treeKill from 'tree-kill';
import * as shutil from './shutil';
import type * as vscode from 'vscode'; // import type definitions only

// Type Chroot represents the path to chroot.
// We use nominal typing technique here. https://basarat.gitbook.io/typescript/main-1/nominaltyping
export type Chroot = string & {_brand: 'chroot'};
// Type CrosOut represents the path to the out directory, which may contain
// actual directories mounted on chroot.
export type CrosOut = string & {_brand: 'out'};
// Type Source represents the path to ChromiumOS source.
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
  return undefined;
}

/**
 * Returns the ChromiumOS source directory, given the path to chroot.
 */
export function sourceDir(chroot: Chroot): Source {
  return path.dirname(chroot) as Source;
}

/**
 * Returns the ChromiumOS out directory, given the path to source (chromeos root).
 */
export function crosOutDir(source: Source): CrosOut {
  return path.join(source, 'out') as CrosOut;
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
   * cancelled or completed. If the job is cancelled, the returned promise is
   * resolved with null.
   */
  offer(job: () => Promise<T>): Promise<T | null> {
    return new Promise((resolve, reject) => {
      this.tasks.push(new Task(job, resolve, reject));
      void this.handle();
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
  /**
   * When set, outputs are logged with this function.
   * Usually this is a vscode.OutputChannel object, but only append() is required.
   */
  logger?: Pick<vscode.OutputChannel, 'append'>;

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
   * Whether to kill the entire process tree when cancelling the operation. Defaults to `false`.
   *
   * TODO(b/301574822): Consider removing this option and instead default to `true` for all
   * commands.
   */
  treeKillWhenCancelling?: boolean;

  /**
   * Current working directory of the child process.
   */
  cwd?: string;

  /**
   * Environment variables passed to the subprocess.
   */
  env?: childProcess.SpawnOptions['env'];
}

/**
 * Command was run, returned non-zero exit status,
 * and `exec` option was to return an error.
 */
export class AbnormalExitError extends Error {
  constructor(
    cmd: string,
    args: string[],
    readonly exitStatus: number | null,
    readonly stdout: string,
    readonly stderr: string
  ) {
    super(
      `"${shutil.escapeArray([
        cmd,
        ...args,
      ])}" failed, exit status: ${exitStatus}`
    );
  }

  messageWithStdoutAndStderr(): string {
    return `${this.message}\nStdout:\n${this.stdout}\nStderr:\n${this.stderr}`;
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

/**
 * Executed command or tooling didn't behave as expected. This could happen if the tool changes in
 * a breaking way with our integration, and cros-ide has not been updated.
 */
export class UnexpectedCommandBehaviorError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

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
 * Tests can use testing.installFakeExec to fake this function. See the
 * documentation of the function for details.
 *
 * @param options Optional parameters. See `ExecOptions` for the description.
 */
export function exec(
  name: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult | Error> {
  return execPtr(name, args, options);
}

/**
 * Same as exec except in case of error this function throws it instead of
 * returning it.
 */
export async function execOrThrow(
  name: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const result = await exec(name, args, options);
  if (result instanceof Error) {
    throw result;
  }
  return result;
}

let execPtr = realExec;

/**
 * Tests shouldn't directly call this function. Use installFakeExec instead.
 *
 * @returns real exec function and the function to undo this operation.
 */
export function setExecForTesting(fakeExec: typeof exec): {
  realExec: typeof exec;
  undo: () => void;
} {
  const original = execPtr;
  execPtr = fakeExec;
  return {
    realExec,
    undo: () => {
      execPtr = original;
    },
  };
}

function realExec(
  name: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult | Error> {
  return new Promise((resolve, _reject) => {
    if (options.logger) {
      options.logger.append(shutil.escapeArray([name, ...args]) + '\n');
    }

    const spawnOpts: childProcess.SpawnOptionsWithoutStdio = {
      cwd: options.cwd,
      env: options.env,
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

export async function withTempDir(
  f: (tempDir: string) => Promise<void>
): Promise<void> {
  let td: string | undefined;
  try {
    td = await fs.promises.mkdtemp(os.tmpdir() + '/');
    await f(td);
  } finally {
    if (td) {
      await fs.promises.rm(td, {recursive: true});
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

/**
 * Finds the root directory of the Git repository containing the filePath,
 * which can be a regular file or a directory.
 * Returns undefined if the file is not under a Git repository.
 */
export function findGitDir(filePath: string): string | undefined {
  let dir: string;
  if (!fs.existsSync(filePath)) {
    // tests use files that do not exist
    dir = path.dirname(filePath);
  } else if (fs.statSync(filePath).isFile()) {
    dir = path.dirname(filePath);
  } else {
    dir = filePath;
  }

  while (!fs.existsSync(path.join(dir, '.git'))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }

  return dir;
}

type Job<T> = () => Promise<T>;
type JobQueueItem<T> = {
  job: Job<T>;
  resolve: (x: T) => void;
  reject: (reason?: unknown) => void;
};

/**
 * Provides a function to run jobs exclusively.
 *
 * Example:
 *
 *   const m = new Mutex(); // global variable
 *
 *   const result = await m.runExclusive(async () => {
 *     // critical section
 *     return result;
 *   });
 */
export class Mutex<T> {
  private readonly queue: JobQueueItem<T>[] = [];
  private running = false;

  constructor() {}

  /**
   * Runs the job exclusively, it is fulfilled or rejected with the result of the job.
   */
  async runExclusive(job: Job<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({job, resolve, reject});
      void this.handle();
    });
  }

  private async handle() {
    if (this.running || this.queue.length === 0) {
      return;
    }
    this.running = true;

    const task = this.queue.shift()!;
    try {
      const value = await task.job();
      setImmediate(() => task.resolve(value));
    } catch (e) {
      setImmediate(() => task.reject(e));
    } finally {
      this.running = false;
      void this.handle();
    }
  }
}

/**
 * Utility which caches results of operations that complete successfully,
 * but retires on failures.
 */
export class CacheOnSuccess<T> {
  value: T | undefined;
  promise: Promise<T> | undefined;

  constructor(private readonly job: () => Promise<T>) {}

  async getOrThrow(): Promise<T> {
    if (this.value) {
      return this.value;
    }
    if (this.promise) {
      return this.promise;
    }
    try {
      this.promise = this.job();
      this.value = await this.promise;
      return this.value;
    } catch (err) {
      this.value = undefined;
      this.promise = undefined;
      throw err;
    }
  }
}
