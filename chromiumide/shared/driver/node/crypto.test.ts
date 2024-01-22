// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {randomUUID} from './crypto';

describe('crypto', () => {
  it('randomUUID should work', () => {
    expect(randomUUID().length).toBe(36);
  });
});
