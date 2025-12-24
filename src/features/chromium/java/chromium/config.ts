// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Information needed to configure the Java compiler to process Java source
 * files in the repository.
 */
export interface CompilerConfig {
  classPaths: string[];
  sourcePaths: string[];
}
