// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {CancellationTokenSource} from '../cancellation_token';
import {Progress} from '../progress';
import type * as vscode from 'vscode';

export function withProgress<R>(
  _options: vscode.ProgressOptions,
  task: (
    progress: vscode.Progress<{
      increment: number;
      message: string;
    }>,
    token: vscode.CancellationToken
  ) => Thenable<R>
): Thenable<R> {
  return (async () => {
    const progress = new Progress();
    const source = new CancellationTokenSource();

    const res = await task(progress, source.token);

    source.dispose();

    return res;
  })();
}
