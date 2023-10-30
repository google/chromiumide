// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Ensure all currently pending microtasks and all microtasks transitively
 * queued by them have finished.
 *
 * This function can be useful for waiting for an async event handler to finish
 * after an event is fired, for example.
 */
export async function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

/**
 * Flush microtasks until the given condition is satisfied or the timeout is reached.
 *
 * This method is usually not the most efficient way to achieve what you want and its use should be
 * the last resort. For example, consider having an event emitter to your component and waiting the
 * event in the test using EventReader.
 *
 * Note that the test doesn't automatically fail even if this function returns due to timeout, so
 * the test should assert the condition after the function returns.
 */
export async function flushMicrotasksUntil(
  condition: () => Promise<boolean>,
  timeoutMillis: number
): Promise<void> {
  const conditionWaiter = (async () => {
    while (!(await condition())) {
      await flushMicrotasks();
    }
  })();
  const timer = new Promise(resolve => setTimeout(resolve, timeoutMillis));

  await Promise.race([conditionWaiter, timer]);
}
