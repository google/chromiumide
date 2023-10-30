// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Disposable} from './disposable';
import type * as vscode from 'vscode'; // import types only

type EventListener<T> = (ev: T) => void;

export class EventEmitter<T> implements vscode.EventEmitter<T> {
  private readonly listeners = new Map<symbol, EventListener<T>>();
  private disposed = false;

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  fire(data: T): void {
    for (const listener of this.listeners.values()) {
      setImmediate(() => listener(data));
    }
  }

  get event(): vscode.Event<T> {
    return this.addListener.bind(this);
  }

  private addListener(
    listener: EventListener<T>,
    thisArgs?: unknown,
    disposables?: vscode.Disposable[]
  ): vscode.Disposable {
    if (thisArgs !== undefined) {
      listener = listener.bind(thisArgs);
    }
    if (this.disposed) {
      return new Disposable(() => {});
    }
    const key = Symbol();
    this.listeners.set(key, listener);
    const disposeListener = new Disposable(() => {
      this.listeners.delete(key);
    });
    if (disposables !== undefined) {
      disposables.push(disposeListener);
    }
    return disposeListener;
  }
}
