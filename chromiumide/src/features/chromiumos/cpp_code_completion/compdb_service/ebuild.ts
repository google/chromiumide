// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {BoardOrHost} from '../../../../common/chromiumos/board_or_host';
import {buildGet9999EbuildCommand} from '../../../../common/chromiumos/portage/equery';
import * as commonUtil from '../../../../common/common_util';
import * as services from '../../../../services';
import {CompdbError, CompdbErrorKind} from './error';

/** Represents the filepath to an artifact. */
export type Artifact = {
  /** The base dir to the artifact. */
  baseDir: string;
  /** The relative path to the artifact from the base dir. */
  path: string;
};

export class Ebuild {
  constructor(
    private readonly board: BoardOrHost,
    readonly qualifiedPackageName: string,
    private readonly output: Pick<
      vscode.OutputChannel,
      'append' | 'appendLine'
    >,
    private readonly crosFs: services.chromiumos.CrosFs,
    private readonly useFlags: string[],
    private readonly cancellation?: vscode.CancellationToken
  ) {}

  static globalMutexMap: Map<string, commonUtil.Mutex<Artifact | undefined>> =
    new Map();

  private mutex() {
    const key = `${this.board.toString()}:${this.qualifiedPackageName}:${
      this.crosFs.source.root
    }`;
    const existing = Ebuild.globalMutexMap.get(key);
    if (existing) {
      return existing;
    }
    const mutex = new commonUtil.Mutex<Artifact | undefined>();
    Ebuild.globalMutexMap.set(key, mutex);
    return mutex;
  }

  /**
   * Generates compilation database.
   *
   * We run concurrent operations exclusively if the board, package name, and chroot path
   * for the operations are exactly the same.
   *
   * @throws CompdbError on failure.
   */
  async generate(): Promise<Artifact | undefined> {
    return await this.mutex().runExclusive(async () => {
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
    });
  }

  /**
   * The value of PORTAGE_BUILDDIR
   * https://devmanual.gentoo.org/ebuild-writing/variables/index.html
   */
  private portageBuildDir(): string {
    return path.join(
      this.board.sysroot(),
      'tmp/portage',
      this.qualifiedPackageName + '-9999'
    );
  }

  /**
   * build directory is determined by `cros-workon_get_build_dir`. The results depend on whether
   * CROS_WORKON_INCREMENTAL_BUILD is set or not.
   */
  private buildDirs(): string[] {
    return [
      // If CROS_WORKON_INCREMENTAL_BUILD=="1"
      path.join(
        this.board.sysroot(),
        'var/cache/portage',
        this.qualifiedPackageName
      ),
      // Otherwise
      path.join(this.portageBuildDir(), 'work', 'build'),
      path.join(this.portageBuildDir()),
    ];
  }

  /**
   * Returns the path to ebuild inside chroot which Portage would use if
   * cros_workon was run for the package.
   */
  async ebuild9999(): Promise<string> {
    const pkg = {
      category: this.qualifiedPackageName.split('/')[0],
      name: this.qualifiedPackageName.split('/')[1],
    };

    const args = buildGet9999EbuildCommand(this.board, pkg);

    const result = await services.chromiumos.execInChroot(
      this.crosFs.source.root,
      args[0],
      args.slice(1),
      {
        logger: this.output,
        logStdout: true,
        cancellationToken: this.cancellation,
        sudoReason: 'to get ebuild filepath',
      }
    );

    if (result instanceof Error) {
      throw result;
    }

    return result.stdout.trim();
  }

  /**
   * Removes .configured and .compiled cache files.
   *
   * @throws CompdbError on failure.
   */
  private async removeCache() {
    for (const dir of this.buildDirs()) {
      let firstError: Error | undefined = undefined;
      let hasRemovedCache = false;

      for (const fs of [this.crosFs.chroot, this.crosFs.out]) {
        let cache = '';
        try {
          cache = path.join(dir, '.configured');
          this.output.appendLine(`Removing cache file ${cache}`);
          await fs.rm(cache, {force: true});

          cache = path.join(dir, '.compiled');
          this.output.appendLine(`Removing cache file ${cache}`);
          await fs.rm(cache, {force: true});

          hasRemovedCache = true;
        } catch (e) {
          firstError = new CompdbError({
            kind: CompdbErrorKind.RemoveCache,
            cache: cache,
            reason: e as Error,
          });
        }
      }

      if (!hasRemovedCache) {
        throw firstError;
      }
    }
  }

  private async runCompgen() {
    const res = await services.chromiumos.execInChroot(
      this.crosFs.source.root,
      'env',
      [
        'USE=' + this.useFlags.join(' '),
        this.board.suffixedExecutable('ebuild'),
        await this.ebuild9999(),
        'clean',
        'compile',
      ],
      {
        logger: this.output,
        logStdout: true,
        cancellationToken: this.cancellation,
        sudoReason: 'to generate C++ cross references',
      }
    );
    if (res instanceof Error) {
      throw res;
    }
  }

  private async artifactPath(): Promise<Artifact | undefined> {
    const candidates: Array<[Date, Artifact]> = [];
    for (const dir of this.buildDirs()) {
      const file = path.join(
        dir,
        'out/Default/compile_commands_no_chroot.json'
      );
      for (const fs of [this.crosFs.chroot, this.crosFs.out]) {
        try {
          const stat = await fs.stat(file);
          candidates.push([
            stat.mtime,
            {
              path: file,
              baseDir: fs.root,
            },
          ]);
        } catch (_e) {
          // Ignore possible file not found error, which happens because we
          // heuristically search for the compile commands from multiple places.
        }
      }
    }
    if (candidates.length === 0) {
      return undefined;
    }
    return candidates.sort().pop()![1];
  }
}
