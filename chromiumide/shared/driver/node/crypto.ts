// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as crypto from 'crypto';

export function randomUUID(): string {
  return crypto.randomUUID();
}
