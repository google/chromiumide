// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import {Fs} from '../../shared/driver/fs';

export class FsImpl implements Fs {
  async exists(path: string): Promise<boolean> {
    return fs.existsSync(path);
  }
  async isDirectory(path: string): Promise<boolean | Error> {
    try {
      return (await fs.promises.stat(path)).isDirectory();
    } catch (e) {
      return e as Error;
    }
  }
  async realpath(path: string, options?: {encoding: 'utf8'}): Promise<string> {
    return fs.promises.realpath(path, options);
  }
  async readFile(path: string): Promise<string> {
    return fs.promises.readFile(path, 'utf-8');
  }
  async copyFile(path: string, dest: string): Promise<void> {
    return fs.promises.copyFile(path, dest);
  }

  async mTime(path: string): Promise<number> {
    return (await fs.promises.stat(path)).mtimeMs;
  }
  async aTime(path: string): Promise<number> {
    return (await fs.promises.stat(path)).atimeMs;
  }
  readdir(path: string): Promise<string[]> {
    return fs.promises.readdir(path);
  }
  rm(path: string, opts?: {force?: boolean}): Promise<void> {
    return fs.promises.rm(path, opts);
  }
  watch(
    path: string,
    listener?: (eventType: string, fileName: string | null) => void
  ): void {
    fs.watch(path, listener);
  }
}
