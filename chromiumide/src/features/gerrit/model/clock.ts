// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {clearInterval} from 'timers';
import * as vscode from 'vscode';

/**
 * Periodically emits event. The first event fires after an interval, not
 * immediately after the instance is created.
 */
export class Clock implements vscode.Disposable {
  private readonly onDidTickEmitter = new vscode.EventEmitter<void>();
  readonly onDidTick = this.onDidTickEmitter.event;

  private readonly intervalId: NodeJS.Timeout;

  constructor(intervalMillis: number, subscriptions?: vscode.Disposable[]) {
    subscriptions?.push(this);

    this.intervalId = setInterval(() => {
      this.onDidTickEmitter.fire();
    }, intervalMillis);
  }

  dispose(): void {
    clearInterval(this.intervalId);

    this.onDidTickEmitter.dispose();
  }
}
