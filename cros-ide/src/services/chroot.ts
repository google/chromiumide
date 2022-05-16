// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import {WrapFs} from '../common/cros';

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
    private sourceFs: WrapFs<commonUtil.Source> | undefined
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

  onUpdate() {
    const chroot = findChroot();
    if (chroot === undefined) {
      this.setChroot(undefined);
      this.setSource(undefined);
      return;
    }
    this.setChroot(new WrapFs(chroot));
    this.setSource(new WrapFs(commonUtil.sourceDir(chroot)));
  }
}

function findChroot(): commonUtil.Chroot | undefined {
  if (commonUtil.isInsideChroot()) {
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
