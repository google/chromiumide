// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

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
