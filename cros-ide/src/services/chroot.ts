// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import {WrapFs} from '../common/cros';
import * as sudo from './sudo';

export function activate(context: vscode.ExtensionContext): ChrootService {
  const service = new ChrootService(undefined, undefined);
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(_e => {
      service.onUpdate();
    })
  );
  service.onUpdate();
  return service;
}

/**
 * Provides tools to operate chroot.
 */
export class ChrootService {
  constructor(
    private chrootFs: WrapFs<commonUtil.Chroot> | undefined,
    private sourceFs: WrapFs<commonUtil.Source> | undefined,
    private readonly isInsideChroot: () => boolean = commonUtil.isInsideChroot
  ) {}

  /**
   * Returns an accessor to files under chroot. Don't store the returned value,
   * as it might change when user opens different workspace.
   */
  chroot(): WrapFs<commonUtil.Chroot> | undefined {
    return this.chrootFs;
  }

  private setChroot(chrootFs: WrapFs<commonUtil.Chroot> | undefined) {
    this.chrootFs = chrootFs;
  }

  /**
   * Returns an accessor to files under source. Don't store the returned value,
   * as it might change when user opens different workspace.
   */
  source(): WrapFs<commonUtil.Source> | undefined {
    return this.sourceFs;
  }

  private setSource(sourceFs: WrapFs<commonUtil.Source> | undefined) {
    this.sourceFs = sourceFs;
  }

  /**
   * Executes command in chroot. Returns InvalidPasswordError in case the user
   * enters invalid password.
   */
  async exec(
    name: string,
    args: string[],
    options: sudo.SudoExecOptions
  ): ReturnType<typeof commonUtil.exec> {
    if (this.isInsideChroot()) {
      return commonUtil.exec(name, args, options);
    }
    const source = this.source();
    if (source === undefined) {
      return new Error(
        'cros_sdk not found; open a directory under which chroot has been set up'
      );
    }
    const crosSdk = path.join(source.root, 'chromite/bin/cros_sdk');
    const crosSdkArgs = ['--', name, ...args];
    return sudo.execSudo(crosSdk, crosSdkArgs, options);
  }

  onUpdate() {
    const chroot = this.findChroot();
    // Context for the custom `when` clause in boards and packages view.
    vscode.commands.executeCommand('setContext', 'cros-ide.chrootPath', chroot);
    if (chroot === undefined) {
      this.setChroot(undefined);
      this.setSource(undefined);
      return;
    }
    this.setChroot(new WrapFs(chroot));
    this.setSource(new WrapFs(commonUtil.sourceDir(chroot)));
  }

  private findChroot(): commonUtil.Chroot | undefined {
    if (this.isInsideChroot()) {
      return '/' as commonUtil.Chroot;
    }
    // TODO(oka): What if the user has two different chroots, and has workspace
    // folders for both? Currently we choose one of them arbitrarily, but we may
    // need to choose one based on the file being opened.
    for (const folder of vscode.workspace.workspaceFolders || []) {
      const r = commonUtil.findChroot(folder.uri.fsPath);
      if (r !== undefined) {
        return r;
      }
    }
    return undefined;
  }
}
