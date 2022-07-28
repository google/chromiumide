// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../common/common_util';
import {WrapFs} from '../../../common/cros';
import {Atom} from '../packages';
import {ChrootService} from '../../../services/chroot';
import {MNT_HOST_SOURCE} from '../constants';
import {Board, HOST} from './board';
import {CompdbError, CompdbErrorKind} from './error';
import {packageName} from './util';

export class Ebuild {
  constructor(
    private readonly board: Board,
    private readonly atom: Atom,
    private readonly output: vscode.OutputChannel,
    private readonly chrootFs: WrapFs<commonUtil.Chroot>,
    private readonly chrootService: ChrootService,
    private readonly useFlag = 'compdb_only'
  ) {}

  /**
   * Generates compilation database.
   *
   * @throws CompdbError on failure.
   */
  async generate(): Promise<string | undefined> {
    await this.removeCache();
    try {
      await this.runCompgen();
    } catch (e: unknown) {
      throw new CompdbError({
        kind: CompdbErrorKind.RunEbuild,
        reason: e as Error,
      });
    }
    return await this.artifactPath();
  }

  /**
   * Result of `portageq envvar SYSROOT`
   */
  private sysroot(): string {
    return this.board === HOST ? '/' : path.join('/build', this.board);
  }

  private ebuildExecutable(): string {
    return this.board === HOST ? 'ebuild' : 'ebuild-' + this.board;
  }

  /**
   * The value of PORTAGE_BUILDDIR
   * https://devmanual.gentoo.org/ebuild-writing/variables/index.html
   */
  private portageBuildDir(): string {
    return path.join(this.sysroot(), 'tmp/portage', this.atom + '-9999');
  }

  /**
   * build directory is determined by `cros-workon_get_build_dir`. The results depend on whether
   * CROS_WORKON_INCREMENTAL_BUILD is set or not.
   */
  private buildDirs(): string[] {
    return [
      // If CROS_WORKON_INCREMENTAL_BUILD=="1"
      path.join(this.sysroot(), 'var/cache/portage', this.atom),
      // Otherwise
      path.join(this.portageBuildDir(), 'work', 'build'),
      path.join(this.portageBuildDir()),
    ];
  }

  private ebuild9999(): string {
    return path.join(
      MNT_HOST_SOURCE,
      'src/third_party/chromiumos-overlay',
      this.atom,
      packageName(this.atom) + '-9999.ebuild'
    );
  }

  /**
   * Removes .configured and .compiled cache files.
   *
   * @throws CompdbError on failure.
   */
  private async removeCache() {
    for (const dir of this.buildDirs()) {
      let cache = '';
      try {
        cache = path.join(dir, '.configured');
        this.output.appendLine(`Removing cache file ${cache}`);
        await this.chrootFs.rm(cache, {force: true});

        cache = path.join(dir, '.compiled');
        this.output.appendLine(`Removing cache file ${cache}`);
        await this.chrootFs.rm(cache, {force: true});
      } catch (e) {
        throw new CompdbError({
          kind: CompdbErrorKind.RemoveCache,
          cache: cache,
          reason: e as Error,
        });
      }
    }
  }

  private async runCompgen() {
    const res = await this.chrootService.exec(
      'env',
      [
        'USE=' + this.useFlag,
        this.ebuildExecutable(),
        this.ebuild9999(),
        'clean',
        'compile',
      ],
      {
        logger: this.output,
        logStdout: true,
        sudoReason: 'to generate C++ cross references',
      }
    );
    if (res instanceof Error) {
      throw res;
    }
  }

  private async artifactPath(): Promise<string | undefined> {
    const filepath = commonUtil.isInsideChroot()
      ? 'compile_commands_chroot.json'
      : 'compile_commands_no_chroot.json';
    const candidates: Array<[Date, string]> = [];
    for (const dir of this.buildDirs()) {
      const file = path.join(dir, 'out/Default', filepath);
      try {
        const stat = await this.chrootFs.stat(file);
        candidates.push([stat.mtime, file]);
      } catch (_e) {
        // Ignore possible file not found error, which happens because we
        // heuristically search for the compile commands from multiple places.
      }
    }
    if (candidates.length === 0) {
      return undefined;
    }
    return candidates.sort().pop()![1];
  }
}
