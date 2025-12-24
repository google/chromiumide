// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';

/**
 * Represents a versioned local git file. This class can be used as the key of a
 * map, because the `create` static function returns the same object if
 * identical parameters are given.
 */
export class GitFileKey {
  private static readonly cache = new Map<string, GitFileKey>();

  static create(
    gitDir: string,
    commitId: string,
    filePath: string
  ): GitFileKey {
    const cacheKey = `${gitDir}/${filePath}@${commitId}`;
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) return cachedResult;

    const result = new this(gitDir, commitId, filePath);
    this.cache.set(cacheKey, result);
    return result;
  }

  private constructor(
    readonly gitDir: string,
    readonly commitId: string,
    readonly filePath: string
  ) {}

  /** Absolute filepath */
  fileName(): string {
    return path.join(this.gitDir, this.filePath);
  }
}
