// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export class Memento implements vscode.Memento {
  private readonly map: Map<string, unknown> = new Map();

  keys(): readonly string[] {
    return [...this.map.keys()];
  }

  get<T>(key: string, defaultValue?: T): T {
    const t = this.map.get(key) as T;
    if (t !== undefined) {
      return t;
    }
    // We need to return T, but defaultValue can be undefined,
    // so check it and throw and Error if needed.
    if (defaultValue) {
      return defaultValue;
    }
    throw new Error('internal error in Memento.get()');
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.map.delete(key);
    } else {
      this.map.set(key, value);
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }
}
