// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

/**
 * Polls until the condition is met, the timeout is reached, or cancallation is requested. Returns
 * whether the condition is met.
 */
export async function pollUntil(
  condition: () => boolean,
  {interval, timeout}: {interval: number; timeout: number},
  token?: vscode.CancellationToken
): Promise<boolean> {
  if (condition()) return true;

  return new Promise(resolve => {
    let finished = false;

    const finish = () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      cancelListener?.dispose();
      finished = true;
    };

    const timeoutId = setTimeout(() => {
      if (finished) return;

      finish();
      resolve(false);
    }, timeout);

    const intervalId = setInterval(() => {
      if (finished) return;

      if (condition()) {
        finish();
        resolve(true);
      }
    }, interval);

    const cancelListener = token?.onCancellationRequested(() => {
      if (finished) return;

      finish();
      resolve(false);
    });
  });
}
