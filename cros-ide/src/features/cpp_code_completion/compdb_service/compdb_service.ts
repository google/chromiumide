// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {PackageInfo} from '../packages';

/**
 * Generates C++ compilation database, using the compdb tool.
 * https://sarcasm.github.io/notes/dev/compilation-database.html#compdb
 */
export interface CompdbService {
  /**
   * Generate compilation database. This method should be called only when generating
   * compilation database is actually needed.
   */
  generate(board: string, packageInfo: PackageInfo): Promise<void>;
}
