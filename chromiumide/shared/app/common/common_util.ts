// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Common utilities between extension code and tools such as installation
 * script. This file should not depend on 'vscode'.
 */

import {getDriver} from './driver_repository';
import {ExecOptions, ExecResult} from './exec/types';

const driver = getDriver();

// Type Chroot represents the path to chroot.
// We use nominal typing technique here. https://basarat.gitbook.io/typescript/main-1/nominaltyping
export type Chroot = string & {_brand: 'chroot'};
// Type CrosOut represents the path to the out directory, which may contain
// actual directories mounted on chroot.
export type CrosOut = string & {_brand: 'out'};
// Type Source represents the path to ChromiumOS source.
export type Source = string & {_brand: 'source'};

export async function isInsideChroot(): Promise<boolean> {
  return await isChroot('/');
}

export async function isChroot(dir: string): Promise<boolean> {
  return await driver.fs.exists(
    driver.path.join(dir, '/etc/cros_chroot_version')
  );
}

/**
 * Returns the chroot in dir or its ancestor, or undefined on not found.
 */
export async function findChroot(dir: string): Promise<Chroot | undefined> {
  for (;;) {
    const chroot = driver.path.join(dir, 'chroot');
    if (await isChroot(chroot)) {
      return chroot as Chroot;
    }

    const d = driver.path.dirname(dir);
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
  return driver.path.dirname(chroot) as Source;
}

/**
 * Returns the ChromiumOS out directory, given the path to source (chromeos root).
 */
export function crosOutDir(source: Source): CrosOut {
  return driver.path.join(source, 'out') as CrosOut;
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

const realExec = (name: string, args: string[], options: ExecOptions = {}) =>
  driver.exec(name, args, options);
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
  execPtr = fakeExec;
  return {
    realExec: driver.exec,
    undo: () => {
      execPtr = driver.exec;
    },
  };
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
export async function findGitDir(
  filePath: string
): Promise<string | undefined> {
  let dir: string;
  if (!(await driver.fs.exists(filePath))) {
    // tests use files that do not exist
    dir = driver.path.dirname(filePath);
  } else if (await driver.fs.isDirectory(filePath)) {
    dir = filePath;
  } else {
    dir = driver.path.dirname(filePath);
  }

  while (!(await driver.fs.exists(driver.path.join(dir, '.git')))) {
    const parent = driver.path.dirname(dir);
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
