// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

export type Cros = Readonly<{
  /**
   * Returns the path of chroot in the relevant ChromiumOS repository.
   * @param path of file that is in the ChromiumOS repository the chroot belongs to.
   *   - on vscode, returns undefined if path is undefined
   *   - on cider, returns the chroot in cog workspace ChromeOS repository with or without a path.
   */
  findChroot(path?: string): Promise<string | undefined>;
  /**
   * Returns the path of the relevant ChromiumOS repository.
   * @param path of file that is in the ChromiumOS repository.
   *   - on vscode, returns undefined if path is undefined
   *   - on cider, returns the cog workspace ChromeOS repository with or without a path.
   */
  findSourceDir(path?: string): Promise<string | undefined>;
  getDepotToolsPath(): Promise<string>;
}>;
