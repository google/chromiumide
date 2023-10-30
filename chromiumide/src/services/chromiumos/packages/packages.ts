// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as services from '../..';
import {findChroot, sourceDir} from '../../../common/common_util';
import {Mapping} from './mapping';
import {SourceDir, PackageInfo} from './types';

export class Packages {
  private mapping = new Map<SourceDir, PackageInfo>();

  /**
   * If autoDetect is true, instead of using a hard-coded mapping, we lazily generate
   * the mapping from the current repository when it's needed.
   */
  private constructor(
    private readonly chrootService: services.chromiumos.ChrootService
  ) {}

  private static instances = new Map<string, Packages>();
  /**
   * Creates an instance of this class. If this function has been called with the same
   * parameter, it returns the cached instance.
   */
  static getOrCreate(
    chrootService: services.chromiumos.ChrootService
  ): Packages {
    const key = chrootService.source.root;
    const cached = Packages.instances.get(key);
    if (cached) {
      return cached;
    }
    const instance = new Packages(chrootService);
    Packages.instances.set(key, instance);
    return instance;
  }

  private ensureGeneratedWaiter: undefined | Promise<void>;

  /**
   * Ensure generation of `this.mapping`. After the function successfully
   * finishes, it's guaranteed that the mapping has been populated. It's safe to
   * call this function concurrently, and it's guaranteed that actual
   * computation of the mapping happens only once.
   */
  private async ensureGenerated(): Promise<void> {
    if (this.ensureGeneratedWaiter) {
      await this.ensureGeneratedWaiter;
      return;
    }

    this.ensureGeneratedWaiter = (async () => {
      const source = this.chrootService.source;
      if (!source) {
        return;
      }
      for (const packageInfo of await Mapping.generate(source.root)) {
        this.mapping.set(packageInfo.sourceDir, packageInfo);
      }
    })();

    return await this.ensureGeneratedWaiter;
  }

  /**
   * Get information of the package that would compile the file and generates
   * compilation database, or null if no such package is known.
   */
  async fromFilepath(filepath: string): Promise<PackageInfo | null> {
    await this.ensureGenerated();

    let realpath = '';
    try {
      realpath = await fs.promises.realpath(filepath);
    } catch (_e) {
      // If filepath is an absolute path, assume it's a realpath. This is
      // convenient for testing, where the file may not exist.
      if (path.isAbsolute(filepath)) {
        realpath = filepath;
      } else {
        return null;
      }
    }

    const chroot = findChroot(realpath);
    if (chroot === undefined) {
      return null;
    }
    const sourcePath = sourceDir(chroot);

    let relPath = path.relative(sourcePath, realpath);
    if (relPath.startsWith('..') || path.isAbsolute(relPath)) {
      return null;
    }
    while (relPath !== '.') {
      const info = this.mapping.get(relPath);
      if (info !== undefined) {
        return info;
      }
      relPath = path.dirname(relPath);
    }
    return null;
  }
}
