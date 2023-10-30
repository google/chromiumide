// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as dateFns from 'date-fns';
import * as common_util from './common_util';

/**
 * Gets the default/recommended directory for storing cached files. This location is within the
 * data storage folder provided by vscode for our extension.
 */
export async function getDefaultCacheDir(
  context: vscode.ExtensionContext
): Promise<string> {
  return path.join(context.globalStoragePath, 'cache');
}

/**
 * Caches CNS files (go/cns) on the local filesystem, refreshing (aka invalidating) at the given
 * frequency.
 */
export class CnsFileCache {
  /**
   * @param loggingOutput OutputChannel to which to log
   * @param cacheFolder Path to cache folder on the local file system. Use getDefaultCacheDir()
   *   unless you need it to be in a different location. All CNS files will be cached in a 'cns'
   *   subfolder of this path.
   */
  constructor(
    readonly loggingOutput: vscode.OutputChannel | undefined,
    readonly cacheFolder: string
  ) {}

  /**
   * Returns the path to the locally cached copy of the given file on CNS, downloading or
   * refreshing if necessary.
   *
   * @param cnsPath The path of the file on CNS (/cns/...)
   * @param refreshFrequency How often the file should be downloaded again.
   * @throws Error upon failure.
   */
  async getCachedFile(
    cnsPath: string,
    refreshFrequency: dateFns.Duration = {years: Infinity}
  ): Promise<string> {
    const updated = await this.readTimeOfLastDownload(cnsPath);
    if (dateFns.isAfter(Date.now(), dateFns.add(updated, refreshFrequency))) {
      await this.forceRedownload(cnsPath);
      // Note that we could simply check the timestamp of the file on CNS to see if it has been
      // updated, before downloading it unnecessarily. However, even listing a file on CNS can take
      // several seconds; it is the querying of CNS that takes a lot of time, not so much data
      // transfer (except at scale wrt file size, of course).
    }
    return this.getCachePath(cnsPath);
  }

  /**
   * Forces the file to be downloaded again, i.e. the cache is refreshed / "invalidated".
   *
   * @param cnsPath CNS file path (/cns/...)
   * @returns Path to the locally cached file.
   * @throws Error upon failure.
   */
  async forceRedownload(cnsPath: string): Promise<string> {
    const cachedPath = this.getCachePath(cnsPath);
    await fs.promises.mkdir(path.dirname(cachedPath), {recursive: true}); // Make sure the directory exists
    await common_util.execOrThrow(
      'fileutil',
      ['cp', '-f', cnsPath, cachedPath],
      {
        logger: this.loggingOutput,
        logStdout: true,
      }
    );
    return cachedPath;
  }

  private async readTimeOfLastDownload(cnsPath: string): Promise<Date> {
    const cachedPath = this.getCachePath(cnsPath);
    if (fs.existsSync(cachedPath)) {
      const stats = await fs.promises.stat(cachedPath);
      return stats.mtime;
    } else {
      return new Date(0);
    }
  }

  private getCachePath(cnsPath: string): string {
    // Since all CNS paths begin with '/cns/', we will be caching to a 'cns' subfolder of the
    // cacheFolder.
    return path.join(this.cacheFolder, cnsPath);
  }
}
