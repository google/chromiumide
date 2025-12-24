// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export type Fs = Readonly<{
  exists(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean | Error>;
  realpath(path: string, options?: {encoding: 'utf8'}): Promise<string>;
  readFile(path: string): Promise<string>;
  copyFile(path: string, dest: string): Promise<void>;
  mTime(path: string): Promise<number>;
  aTime(path: string): Promise<number>;
  readdir(path: string): Promise<string[]>;
  rm(path: string, opts?: {force?: boolean}): Promise<void>;
  watch(
    path: string,
    listener?: (eventType: string, fileName: string | null) => void
  ): void;
}>;
