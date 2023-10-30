// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import {WrapFs} from '../../common/cros';
import * as sudo from '../../services/sudo';

/**
 * Provides tools to operate chroot.
 */
export class ChrootService implements vscode.Disposable {
  private readonly chrootPath = path.join(this.chromiumosRoot, 'chroot');

  // Throws if chroot is not found.
  private constructor(
    readonly chromiumosRoot: string,
    private readonly setContext: boolean
  ) {
    if (!fs.existsSync(this.chrootPath)) {
      throw new Error('chroot not found');
    }
    if (setContext) {
      void vscode.commands.executeCommand(
        'setContext',
        'chromiumide.chrootPath',
        this.chrootPath
      );
    }
  }

  dispose(): void {
    if (this.setContext) {
      void vscode.commands.executeCommand(
        'setContext',
        'chromiumide.chrootPath',
        undefined
      );
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
  get chroot(): WrapFs<commonUtil.Chroot> {
    return new WrapFs(this.chrootPath as commonUtil.Chroot);
  }

  /**
   * Returns an accessor to files under out.
   */
  get out(): WrapFs<commonUtil.CrosOut> {
    return new WrapFs(
      path.join(this.chromiumosRoot, 'out') as commonUtil.CrosOut
    );
  }

  /**
   * Returns an accessor to files under source.
   */
  get source(): WrapFs<commonUtil.Source> {
    return new WrapFs(this.chromiumosRoot as commonUtil.Source);
  }

  get crosFs(): CrosFs {
    return {
      chroot: this.chroot,
      out: this.out,
      source: this.source,
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
    const source = this.source;
    if (source === undefined) {
      return new Error(
        'cros_sdk not found; open a directory under which chroot has been set up'
      );
    }
    return await execInChroot(source.root, name, args, options);
  }
}

async function showChrootNotFoundError(root: string) {
  const OPEN = 'Open';
  const answer = await vscode.window.showErrorMessage(
    `chroot not found under ${root}: follow the developer guide to create a chroot`,
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
 * Holds accessors to files related to chromiumOS.
 */
export type CrosFs = {
  readonly chroot: WrapFs<commonUtil.Chroot>;
  readonly source: WrapFs<commonUtil.Source>;
  readonly out: WrapFs<string>;
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
  source: commonUtil.Source,
  name: string,
  args: string[],
  options: ChrootExecOptions
): ReturnType<typeof commonUtil.exec> {
  const crosSdk = path.join(source, 'chromite/bin/cros_sdk');
  const crosSdkArgs: string[] = [];
  if (options.crosSdkWorkingDir) {
    crosSdkArgs.push('--working-dir', options.crosSdkWorkingDir);
  }
  crosSdkArgs.push('--', name, ...args);
  return sudo.execSudo(crosSdk, crosSdkArgs, options);
}
