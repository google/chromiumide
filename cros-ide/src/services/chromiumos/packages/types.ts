// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Directory containing source code relative to chromiumos/
 */
export type SourceDir = string;

/**
 * category/packagename e.g. chromeos-base/codelab
 */
export type Atom = string;

export interface PackageInfo {
  sourceDir: SourceDir;
  atom: Atom;
}
