// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {EventEmitter} from './event';
import type * as vscode from 'vscode'; // import types only

class CancellationTokenCore {
  isCancellationRequested = false;
  onCancellationRequestedEmitter = new EventEmitter<void>();

  cancel(): void {
    if (this.isCancellationRequested) {
      return;
    }
    this.isCancellationRequested = true;
    this.onCancellationRequestedEmitter.fire();
  }

  dispose(): void {
    this.onCancellationRequestedEmitter.dispose();
  }
}

class CancellationTokenImpl implements vscode.CancellationToken {
  constructor(private readonly core: CancellationTokenCore) {}

  get isCancellationRequested(): boolean {
    return this.core.isCancellationRequested;
  }

  get onCancellationRequested(): vscode.Event<void> {
    return this.core.onCancellationRequestedEmitter.event;
  }
}

export class CancellationTokenSource implements vscode.CancellationTokenSource {
  private readonly core = new CancellationTokenCore();
  readonly token = new CancellationTokenImpl(this.core);

  cancel(): void {
    this.core.cancel();
  }

  dispose(): void {
    this.core.dispose();
  }
}
