// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as config from '../../services/config';

describe('E2E tests', () => {
  it('runs under default config', () => {
    expect(config.metrics.showMessage.get()).toEqual(true);
  });
});
