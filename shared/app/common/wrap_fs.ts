// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {getDriver} from './driver_repository';

const driver = getDriver();

// Wraps functions in fs or fs.promises, adding prefix to given paths.
export class WrapFs {
  constructor(readonly root: string) {}

  realpath(p: string): string {
    if (p.startsWith(this.root)) {
      return p;
    }
    return driver.path.join(this.root, p);
  }

  aTime(p: string): Promise<number> {
    return driver.fs.aTime(this.realpath(p));
  }

  mTime(p: string): Promise<number> {
    return driver.fs.mTime(this.realpath(p));
  }

  exists(p: string): Promise<boolean> {
    return driver.fs.exists(this.realpath(p));
  }

  async readdir(p: string): Promise<string[]> {
    return driver.fs.readdir(this.realpath(p));
  }

  async rm(p: string, opts?: {force?: boolean}): Promise<void> {
    return driver.fs.rm(this.realpath(p), opts);
  }
}
