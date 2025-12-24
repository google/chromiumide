// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Utility to run jobs in parallel with a concurrency cap. Usage:
 *
 * const runner = new ThrottledJobRunner(jobs, 8);
 * const results = await runner.allSettled();
 *
 * The result of jobs[i] is stored in results[i]. Also its guaranteed that jobs
 * are invoked in order, i.e. for i < j, jobs[i] is invoked earlier than jobs[j].
 */
export class ThrottledJobRunner<T> {
  private readonly jobs: Array<() => Promise<T>>;
  private jobIndex = 0;
  private readonly runningPromises = new Map<
    number,
    Promise<PromiseSettledResult<T>>
  >();
  private readonly donePromises: PromiseSettledResult<T>[];
  private donePromisesCount = 0;
  private readonly onAllSettledCallbacks: Array<() => void> = [];

  /**
   * Run all the jobs in such a way that at most `concurrency` jobs are run at
   * the same time.
   */
  constructor(
    jobs: Array<() => Promise<T>>,
    private readonly concurrency: number
  ) {
    if (concurrency <= 0) {
      throw new Error('concurrency should be >= 1, but was ' + concurrency);
    }
    this.jobs = jobs.slice();
    this.donePromises = new Array(this.jobs.length);
    this.serve();
  }

  private serve() {
    while (
      this.runningPromises.size < this.concurrency &&
      this.jobIndex < this.jobs.length
    ) {
      const id = this.jobIndex++;
      const job = this.jobs[id]();
      this.runningPromises.set(
        id,
        (async () => {
          try {
            const result = await job;
            setImmediate(() => void this.process(id));
            return {
              status: 'fulfilled',
              value: result,
            };
          } catch (e) {
            setImmediate(() => void this.process(id));
            return {
              status: 'rejected',
              reason: e,
            };
          }
        })()
      );
    }
  }

  private async process(id: number) {
    const result = await this.runningPromises.get(id)!;
    this.runningPromises.delete(id);
    this.donePromises[id] = result;
    this.donePromisesCount++;

    if (this.jobs.length === this.donePromisesCount) {
      while (this.onAllSettledCallbacks.length) {
        this.onAllSettledCallbacks.shift()!();
      }
    }

    this.serve();
  }

  private onAllSettled(callback: () => void) {
    if (this.jobs.length === this.donePromisesCount) {
      setImmediate(callback);
    } else {
      this.onAllSettledCallbacks.push(callback);
    }
  }

  /**
   * Returns a promise that is fulfilled with the results of the jobs after
   * all the jobs are settled.
   */
  async allSettled(): Promise<PromiseSettledResult<T>[]> {
    return new Promise(resolve => {
      this.onAllSettled(() => {
        resolve(this.donePromises);
      });
    });
  }
}
