// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {flushMicrotasks} from './tasks';

/**
 * Buffers events, so they can be later retrieved with read().
 */
export class EventReader<T> implements vscode.Disposable {
  private subscriptions: vscode.Disposable[] = [];
  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  private readonly queue: T[] = [];
  private waiter?: (x: T) => void;

  constructor(event: vscode.Event<T>, subscriptions?: vscode.Disposable[]) {
    if (subscriptions) {
      subscriptions.push(this);
    }
    this.subscriptions.push(
      event(x => {
        this.queue.push(x);
        this.notify();
      })
    );
  }

  private notify() {
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = undefined;
      const value = this.queue.shift()!;

      setImmediate(() => waiter(value));
    }
  }

  async read(): Promise<T> {
    if (this.queue.length > 0) {
      const arg = this.queue.shift()!;
      return arg;
    }
    if (this.waiter) {
      throw new Error(
        'Invalid usage: read() was called before the previous call was resolved'
      );
    }
    return new Promise(resolve => {
      this.waiter = resolve;
    });
  }

  /**
   * Poll for an event with incrementing fake clock with intervalMillis. `read`
   * should be used instead whenever timeout isn't involved.
   *
   * This method expects fake clock has been installed.
   *
   * If an event comes after a real delay, this method may significantly
   * over-tick the fake clock. This is because the method polls for the event
   * with a minimal real interval, incrementing the fake clock with
   * intervalMillis.
   */
  async poll(intervalMillis: number): Promise<T> {
    for (;;) {
      if (this.queue.length > 0) {
        const arg = this.queue.shift()!;
        return arg;
      }
      jasmine.clock().tick(intervalMillis);

      await flushMicrotasks();
    }
  }
}
