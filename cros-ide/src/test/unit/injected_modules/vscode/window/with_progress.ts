// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';
import {CancellationTokenSource, Progress} from '..';

export async function withProgress<R>(
  _options: vscode.ProgressOptions,
  task: (
    progress: vscode.Progress<{
      increment: number;
      message: string;
    }>,
    token: vscode.CancellationToken
  ) => Thenable<R>
): Promise<R> {
  const progress = new Progress();
  const source = new CancellationTokenSource();

  const res = await task(progress, source.token);

  source.dispose();

  return res;
}
