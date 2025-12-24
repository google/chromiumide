// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export class Progress<T> {
  constructor() {}

  report(_value: T): void {}
}
