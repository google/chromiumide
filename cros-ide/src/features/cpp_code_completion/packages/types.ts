// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export type SourceDir = string; // directory containing source code relative to chromiumos/
export type Atom = string; // category/packagename e.g. chromeos-base/codelab

export interface PackageInfo {
  sourceDir: SourceDir;
  atom: Atom;
}
