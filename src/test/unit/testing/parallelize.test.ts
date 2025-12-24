// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as testing from '../../testing';
import * as parallelize from '../../testing/parallelize';

function fulfilled<T>(x: T): PromiseSettledResult<T> {
  return {
    status: 'fulfilled',
    value: x,
  };
}

function rejected<T>(x: Error): PromiseSettledResult<T> {
  return {
    status: 'rejected',
    reason: x,
  };
}

describe('ThrottledJobRunner', () => {
  it('runs zero jobs', async () => {
    const jobs: Array<() => Promise<number>> = [];
    const runner = new parallelize.ThrottledJobRunner(jobs, 2);

    expect(await runner.allSettled()).toEqual([]);
  });

  it('runs jobs with throttling', async () => {
    const first = await testing.BlockingPromise.new(1);
    const second = await testing.BlockingPromise.new(2);

    let secondRun = false;
    let thirdRun = false;
    const jobs = [
      () => first.promise,
      () => {
        secondRun = true;
        return second.promise;
      },
      async () => {
        thirdRun = true;
        return 3;
      },
      async () => {
        throw new Error('4');
      },
    ];

    const runner = new parallelize.ThrottledJobRunner(jobs, 2);

    expect(secondRun).toBeTrue();
    expect(thirdRun).toBeFalse();

    second.unblock();
    first.unblock();

    expect(await runner.allSettled()).toEqual([
      fulfilled(1),
      fulfilled(2),
      fulfilled(3),
      rejected(new Error('4')),
    ]);
  });
});
