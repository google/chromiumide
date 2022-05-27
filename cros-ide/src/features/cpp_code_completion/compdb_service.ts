// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as uuid from 'uuid';
import * as commonUtil from '../../common/common_util';
import {WrapFs} from '../../common/cros';
import {Atom, PackageInfo} from '../../features/cpp_code_completion/packages';
import {ChrootService, InvalidPasswordError} from '../../services/chroot';
import {MNT_HOST_SOURCE} from './constants';

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

export class CompdbError extends Error {
  constructor(readonly details: CompdbErrorDetails) {
    super(details.kind + (details.reason ? ': ' + details.reason.message : ''));
  }
}

export type CompdbErrorDetails = {reason?: Error} & (
  | {
      kind: CompdbErrorKind.RemoveCache;
      cache: string;
    }
  | {
      kind: CompdbErrorKind.InvalidPassword;
      message: string;
    }
  | {
      kind: CompdbErrorKind.RunEbuild;
    }
  | {
      kind: CompdbErrorKind.NotGenerated;
    }
  | {
      kind: CompdbErrorKind.CopyFailed;
      destination: string;
    }
);

export enum CompdbErrorKind {
  RemoveCache = 'failed to remove cache files before running ebuild',
  InvalidPassword = 'invalid password',
  RunEbuild = 'failed to run ebuild to generate compilation database',
  NotGenerated = 'compilation database was not generated',
  CopyFailed = 'failed to copy compilation database to the source directory',
}

export class CompdbServiceImpl implements CompdbService {
  constructor(
    private readonly log: commonUtil.Log,
    private readonly chrootService: ChrootService
  ) {}

  /**
   * Generates compilation database.
   *
   * @throws CompdbError on failure
   */
  async generate(board: string, {sourceDir, atom}: PackageInfo) {
    const sourceFs = this.chrootService.source();
    const chrootFs = this.chrootService.chroot();
    if (!sourceFs || !chrootFs) {
      this.log(
        `Failed to generate compdb; source exists = ${!!sourceFs}, chroot exists = ${!!chrootFs}`
      );
      return;
    }

    const ebuild = new Ebuild(
      board,
      atom,
      this.log,
      chrootFs,
      this.chrootService
    );
    const artifact = await ebuild.generate();
    if (artifact === undefined) {
      throw new CompdbError({
        kind: CompdbErrorKind.NotGenerated,
      });
    }
    const destination = path.join(
      sourceFs.root,
      sourceDir,
      'compile_commands.json'
    );
    let tempFile;
    for (;;) {
      tempFile = path.join(path.dirname(destination), '.' + uuid.v4());
      if (!fs.existsSync(tempFile)) {
        break;
      }
    }
    try {
      this.log(`Copying ${artifact} to ${tempFile}`);
      await chrootFs.copyFile(artifact, tempFile);
      this.log(`Renaming ${tempFile} to ${destination}`);
      await fs.promises.rename(tempFile, destination);
    } catch (e) {
      throw new CompdbError({
        kind: CompdbErrorKind.CopyFailed,
        destination: destination,
        reason: e as Error,
      });
    } finally {
      await fs.promises.rm(tempFile, {force: true});
    }
  }
}

type Board = string; // 'host' or board name
const HOST: Board = 'host';

function packageName(atom: Atom): string {
  return atom.split('/')[1];
}

class Ebuild {
  constructor(
    private readonly board: Board,
    private readonly atom: Atom,
    private readonly log: commonUtil.Log,
    private readonly chrootFs: WrapFs<commonUtil.Chroot>,
    private readonly chrootService: ChrootService
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
      if (e instanceof InvalidPasswordError) {
        throw new CompdbError({
          kind: CompdbErrorKind.InvalidPassword,
          message: e.message,
        });
      }
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
        this.log(`Removing cache file ${cache}\n`);
        await this.chrootFs.rm(cache, {force: true});

        cache = path.join(dir, '.compiled');
        this.log(`Removing cache file ${cache}\n`);
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
        'USE=compdb_only',
        this.ebuildExecutable(),
        this.ebuild9999(),
        'compile',
      ],
      this.log,
      {logStdout: true}
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
        // hueristically search for the compile commands from multiple places.
      }
    }
    if (candidates.length === 0) {
      return undefined;
    }
    return candidates.sort().pop()![1];
  }
}
