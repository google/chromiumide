// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {LruCache} from '../../../common/lru_cache';
import {GitFileKey} from '../data';
import * as git from '../git';
import {Sink} from '../sink';

// TODO(oka): Put a standalone model that autonomously manages all the relevant
// local diff hunks in this module.

/**
 * Provides APIs to read local diff hunks. It uses caching for computational
 * efficiency.
 */
export class DiffHunksClient {
  private static readonly CACHE_CAPACITY = 100;

  /**
   * Make it easier to look up cached GitFileKeys from their filename.
   *
   * Invariant: Any key of `gitFileToHunks` is contained in a value of this object.
   */
  private readonly fileNameToGitFiles = new Map<string, GitFileKey[]>();

  private readonly gitFileToHunks = new LruCache<GitFileKey, git.Hunk[]>(
    DiffHunksClient.CACHE_CAPACITY
  );

  constructor(private readonly sink: Sink) {}

  /**
   * Evicts cache for the given document. This method should be called whenever
   * a document changes so that the subsequent `readDiffHunks` calls don't
   * return stale cached values.
   */
  evictCacheForDocument(document: vscode.TextDocument): void {
    const gitFiles = this.fileNameToGitFiles.get(document.fileName);
    if (!gitFiles) return;

    for (const gitFile of gitFiles) {
      this.gitFileToHunks.evict(gitFile);
    }
  }

  /**
   * Extracts diff hunks of changes made between the `commitId` and the working
   * tree.
   */
  async readDiffHunks(
    gitDir: string,
    commitId: string,
    filePaths: string[]
  ): Promise<git.FilePathToHunks> {
    const cachedHunks: git.FilePathToHunks = {};
    const filePathsToRead = [];

    for (const filePath of filePaths) {
      const gitFile = GitFileKey.create(gitDir, commitId, filePath);
      const hunks = this.gitFileToHunks.get(gitFile);
      if (hunks) {
        cachedHunks[filePath] = [...hunks];
      } else {
        filePathsToRead.push(filePath);
      }
    }

    if (filePathsToRead.length === 0) {
      return cachedHunks;
    }

    const readHunks = await git.readDiffHunks(
      gitDir,
      commitId,
      filePathsToRead,
      this.sink
    );

    if (readHunks) {
      for (const filePath of filePathsToRead) {
        const hunks = readHunks[filePath] ?? [];
        this.setCache(GitFileKey.create(gitDir, commitId, filePath), hunks);
      }
    }

    return {
      ...cachedHunks,
      ...readHunks,
    };
  }

  private setCache(gitFile: GitFileKey, hunks: git.Hunk[]): void {
    this.gitFileToHunks.set(gitFile, hunks);

    const fileName = gitFile.fileName();
    const gitFiles = this.fileNameToGitFiles.get(fileName);
    if (gitFiles) {
      gitFiles.push(gitFile);
    } else {
      this.fileNameToGitFiles.set(fileName, [gitFile]);
    }

    // Reconstruct the map to reduce its data size. Do it when the size of the
    // map is at least twice as large as the cache size to get the amortized
    // time complexity of O(log n).
    if (this.fileNameToGitFiles.size > DiffHunksClient.CACHE_CAPACITY * 4) {
      this.reconstructFileNameToGitFiles();
    }
  }

  private reconstructFileNameToGitFiles(): void {
    this.fileNameToGitFiles.clear();

    for (const gitFile of this.gitFileToHunks.keys()) {
      const fileName = gitFile.fileName();
      const gitFiles = this.fileNameToGitFiles.get(fileName);
      if (gitFiles) {
        gitFiles.push(gitFile);
      } else {
        this.fileNameToGitFiles.set(fileName, [gitFile]);
      }
    }
  }
}
