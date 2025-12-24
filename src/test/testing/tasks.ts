// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

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
 * Returns a promise that is resolved after timeout or it is cancelled.
 */
async function cancellableSetTimeout(
  timeoutMillis: number,
  token: vscode.CancellationToken
): Promise<void> {
  return new Promise(resolve => {
    const subscriptions: vscode.Disposable[] = [];

    const resolver = () => {
      vscode.Disposable.from(...subscriptions.splice(0)).dispose();
      resolve();
    };

    const timeoutId = setTimeout(resolver, timeoutMillis);

    subscriptions.push(
      token.onCancellationRequested(() => {
        if (token.isCancellationRequested) {
          clearTimeout(timeoutId);
          resolver();
        }
      })
    );
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
  const cancelSource = new vscode.CancellationTokenSource();

  let done = false;
  const timer = (async () => {
    await cancellableSetTimeout(timeoutMillis, cancelSource.token);
    done = true;
  })();

  const conditionWaiter = (async () => {
    while (!done && !(await condition())) {
      await flushMicrotasks();
    }
    cancelSource.cancel();
    cancelSource.dispose();
  })();

  await Promise.all([conditionWaiter, timer]);
}
