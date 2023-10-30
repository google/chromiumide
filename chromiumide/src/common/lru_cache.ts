// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Generic LRU cache implementation whose methods have amortized time complexity
 * of O(log n).
 */
export class LruCache<K, V> {
  /**
   * Creates an LRU cache. The number n denotes the guaranteed capacity of the
   * cache. The number of cached entries doesn't exceed 2n at any point of time.
   */
  constructor(private readonly n: number) {
    if (n <= 0) {
      throw new Error(`LRU cache capacity must be positive but was ${n}`);
    }
  }

  private nextTicketNumber = 0;

  private readonly cache = new Map<K, {ticket: number; value: V}>();

  /**
   * Sets the key value pair with
   * - worst time complexity O(n log n), and
   * - amortized time complexity O(log n).
   */
  set(key: K, value: V): void {
    this.cache.set(key, {ticket: this.nextTicketNumber++, value});
    this.maybeShrink();
  }

  /**
   * Gets the cached value or undefined if it doesn't exist.
   */
  get(key: K): V | undefined {
    const cached = this.cache.get(key);
    if (!cached) return undefined;

    this.cache.set(key, {ticket: this.nextTicketNumber++, value: cached.value});
    return cached.value;
  }

  /**
   * Evicts the key from the cache.
   */
  evict(key: K): void {
    this.cache.delete(key);
  }

  /**
   * Returns keys of the cache.
   */
  keys(): K[] {
    return [...this.cache.keys()];
  }

  // Shrinks the cache if the size >= 2n.
  private maybeShrink() {
    if (this.cache.size < 2 * this.n) return;

    // Run O(n log n) operation to half the data size.
    const lru: {ticket: number; key: K}[] = [];
    for (const [key, {ticket}] of this.cache.entries()) {
      lru.push({ticket, key});
    }
    lru.sort((x, y) => -(x.ticket - y.ticket)); // reverse order

    for (const {key} of lru.slice(this.n)) {
      this.cache.delete(key);
    }
  }
}
