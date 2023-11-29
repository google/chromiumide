// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Based on the real implementation
// https://github.com/microsoft/vscode/blob/main/src/vs/base/common/errors.ts.
export class CancellationError extends Error {
  constructor() {
    super('Canceled');
    this.name = this.message;
  }
}
