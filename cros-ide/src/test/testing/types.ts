// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Mutable removes `readonly` modifier from properties
 * and allows changing them in tests.
 */
export type Mutable<T> = {-readonly [P in keyof T]: T[P]};
