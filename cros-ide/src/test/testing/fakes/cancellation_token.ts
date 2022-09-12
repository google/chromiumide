// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

/**
 * A CancellationToken that is never cancelled.
 */
export class FakeCancellationToken implements vscode.CancellationToken {
  constructor(
    readonly isCancellationRequested: boolean = false,
    readonly onCancellationRequested: vscode.Event<unknown> = new vscode.EventEmitter<unknown>()
      .event
  ) {}
}
