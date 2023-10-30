// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as util from 'util';
import {LruCache} from '../../../common/lru_cache';

describe('LRU cache', () => {
  it('works correctly', () => {
    const n = 3;
    const cache = new LruCache<string, number>(n);

    expect(cache.get('a')).toBeUndefined();

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('b', 4);

    expect(cache.get('a')).toEqual(1);
    expect(cache.get('b')).toEqual(4);
    expect(cache.get('c')).toEqual(3);

    expect(cache.keys().sort()).toEqual(['a', 'b', 'c']);

    cache.evict('a');

    expect(cache.get('a')).toBeUndefined();

    // Test the cache doesn't hold more than 2n entries.
    cache.set('a', 1);
    cache.set('b', 2); // deleted
    cache.set('c', 3); // don't care
    cache.set('d', 4); // don't care
    cache.set('e', 5); // don't care
    cache.set('f', 6); // kept
    cache.set('a', 7); // kept
    cache.set('g', 8); // kept

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('f')).toEqual(6);
    expect(cache.get('a')).toEqual(7);
    expect(cache.get('g')).toEqual(8);

    // Test `get` operations keep the entry away from being evicted.
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a');
    cache.set('d', 4);
    cache.set('e', 5);
    cache.get('a');
    cache.set('f', 6);
    cache.set('g', 8);

    expect(cache.get('a')).toEqual(1);
  });

  it('works efficiently', async () => {
    const n = 1000;
    const cache = new LruCache(n);

    const m = 100_000;

    // m log n ~ 1_000_000.
    for (let i = 0; i < m; i++) {
      cache.set(i, i);
    }
    expect(cache.get(0)).toBeUndefined();
    expect(cache.get(m - 1)).toEqual(m - 1);

    // Ensure timeout works.
    await util.promisify(setImmediate)();
  }, 1000);
});
