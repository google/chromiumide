// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Constructs a Promise that is blocked until a method to unblock is called.
 * Example:
 *
 * const p = await BlockingPromise.new(42);
 * setTimeout(() => p.unblock(), 1000);
 * await p.promise; // Returns 42 after 1 second.
 */
export class BlockingPromise<T> {
  readonly promise: Promise<T>;
  unblock: () => void;

  private constructor(created: (p: BlockingPromise<T>) => void, value: T) {
    this.unblock = () => {}; // placeholder to satisfy type system.
    this.promise = new Promise(resolve => {
      this.unblock = () => resolve(value);
      created(this);
    });
  }

  static async new<T>(value: T): Promise<BlockingPromise<T>> {
    return new Promise(resolve => {
      new BlockingPromise(resolve, value);
    });
  }
}
