// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as testing from '../../testing';

describe('flushMicrotasksUntil', () => {
  const clock = jasmine.clock();
  beforeEach(() => {
    clock.install();
  });
  afterEach(() => {
    clock.uninstall();
  });

  it('returns on timeout', async () => {
    let done = false;
    const job = (async () => {
      await testing.flushMicrotasksUntil(async () => false, 2);
      done = true;
    })();

    clock.tick(1);
    await testing.flushMicrotasks();

    expect(done).toBeFalse();

    clock.tick(1);
    // flushMicrotasksUntil returns after this line because it only queues microtasks (not
    // macrotasks) after timeout. (i.e. we depend on the implementation details of
    // flushMicrotasksUntil here)
    await testing.flushMicrotasks();

    expect(done).toBeTrue();

    await job;
  });

  it('returns on condition satisfied', async () => {
    await testing.flushMicrotasksUntil(async () => true, 1);
  });
});
