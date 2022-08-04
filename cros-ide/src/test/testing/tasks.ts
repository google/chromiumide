// Copyright 2022 The ChromiumOS Authors.
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
