// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../shared/app/common/common_util';
import {WrapFs} from '../../../shared/app/common/wrap_fs';
import {CustomContext} from '../../common/when_clause_context';
import * as sudo from '../../services/sudo';

/**
 * Provides tools to operate chroot.
 */
export class ChrootService implements vscode.Disposable {
  private readonly chrootPath = path.join(this.chromiumosRoot, 'chroot');
  private readonly disposablePromise: Promise<vscode.Disposable> | undefined;

  // Throws if chroot is not found.
  private constructor(
    readonly chromiumosRoot: string,
    private readonly setContext: boolean
  ) {
    if (!fs.existsSync(this.chrootPath)) {
      throw new Error('chroot not found');
    }
    if (setContext) {
      this.disposablePromise = CustomContext.chrootPath.set(this.chrootPath);
    }
  }

  dispose(): void {
    if (this.setContext) {
      void (async () => {
        const disposable = await this.disposablePromise;
        disposable?.dispose();
      })();
    }
  }

  /**
   * Creates the service or returns undefined with showing an error if chroot is
   * not found under the given chromiumos root. Specify setContext = true to set
   * `chromiumide.chrootPath` context for the custom `when` clauses in boards and
   * packages view etc.
   *
   * TODO(oka): remove setContext. This parameter exists for unit tests where
   * vscode.commands.executeCommand is not implemented. We should fake the
   * method and let it always run.
   */
  static maybeCreate(
    root: string,
    setContext = true
  ): ChrootService | undefined {
    try {
      return new ChrootService(root, setContext);
    } catch (_e) {
      void showChrootNotFoundError(root);
      return undefined;
    }
  }

  /**
   * Returns an accessor to files under chroot.
   */
  get chroot(): WrapFs {
    return new WrapFs(this.chrootPath);
  }

  /**
   * Returns an accessor to files under out.
   */
  get out(): WrapFs {
    return new WrapFs(path.join(this.chromiumosRoot, 'out'));
  }

  /**
   * Returns an accessor to files under chromiumos root.
   */
  get chromiumos(): WrapFs {
    return new WrapFs(this.chromiumosRoot);
  }

  get crosFs(): CrosFs {
    return {
      chroot: this.chroot,
      out: this.out,
      chromiumos: this.chromiumos,
    };
  }

  /**
   * Executes command in chroot. Returns InvalidPasswordError in case the user
   * enters invalid password.
   */
  async exec(
    name: string,
    args: string[],
    options: ChrootExecOptions
  ): ReturnType<typeof commonUtil.exec> {
    const chromiumos = this.chromiumos;
    if (chromiumos === undefined) {
      return new Error(
        'cros_sdk was not found; open a directory under which chroot has been set up'
      );
    }
    return await execInChroot(chromiumos.root, name, args, options);
  }

  /**
   * Translates a filepath in chroot to the corresponding one in host.
   * If the argument doesn't start with a slash, it returns the argument as is.
   */
  translatePathFromChroot(filepath: string): string {
    if (filepath.startsWith('/mnt/host/source/')) {
      return filepath.replace('/mnt/host/source/', this.chromiumosRoot + '/');
    }
    if (filepath.startsWith('/build/')) {
      return filepath.replace('/build/', this.chromiumosRoot + '/out/build/');
    }
    if (filepath.startsWith('/')) {
      return filepath.replace('/', this.chromiumosRoot + '/chroot/');
    }
    return filepath;
  }

  /**
   * Translates a filepath in host to the corresponding one in chroot.
   * If the argument doesn't start with the path to chromiumos root, it returns the argument as is.
   */
  translatePathToChroot(filepath: string): string {
    if (filepath.startsWith(this.chromiumosRoot + '/chroot/')) {
      return filepath.replace(this.chromiumosRoot + '/chroot/', '/');
    }
    if (filepath.startsWith(this.chromiumosRoot + '/out/build/')) {
      return filepath.replace(this.chromiumosRoot + '/out/build/', '/build/');
    }
    if (filepath.startsWith(this.chromiumosRoot + '/')) {
      return filepath.replace(this.chromiumosRoot + '/', '/mnt/host/source/');
    }
    return filepath;
  }
}

async function showChrootNotFoundError(root: string) {
  const OPEN = 'Open';
  const answer = await vscode.window.showErrorMessage(
    `A chroot was not found under ${root}: follow the developer guide to create a chroot`,
    OPEN
  );
  if (answer === OPEN) {
    await vscode.env.openExternal(
      vscode.Uri.parse(
        'https://chromium.googlesource.com/chromiumos/docs/+/HEAD/developer_guide.md#Create-a-chroot'
      )
    );
  }
}

/**
 * Holds accessors to files related to ChromiumOS.
 */
export type CrosFs = {
  readonly chroot: WrapFs;
  readonly chromiumos: WrapFs;
  readonly out: WrapFs;
};

export interface ChrootExecOptions extends sudo.SudoExecOptions {
  /**
   * Argument to pass to `cros_sdk --working-dir`.
   */
  crosSdkWorkingDir?: string;
}

/**
 * Executes command in chroot. Returns InvalidPasswordError in case the user
 * enters invalid password.
 */
export async function execInChroot(
  chromiumosRoot: string,
  name: string,
  args: string[],
  options: ChrootExecOptions
): ReturnType<typeof commonUtil.exec> {
  const crosSdk = path.join(chromiumosRoot, 'chromite/bin/cros_sdk');
  const crosSdkArgs: string[] = [];
  if (options.crosSdkWorkingDir) {
    crosSdkArgs.push('--working-dir', options.crosSdkWorkingDir);
  }
  crosSdkArgs.push('--', name, ...args);
  return sudo.execSudo(crosSdk, crosSdkArgs, options);
}
