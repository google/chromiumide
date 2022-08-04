// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import {WrapFs} from '../common/cros';
import * as metrics from '../features/metrics/metrics';
import * as sudo from './sudo';

/**
 * Chroot module detects the location of the chroot.
 *
 * In the following cases chroot cannot be detected:
 * 1. There is no folder with ChromeOS source (a particular case is when
 *    a ChromeOS source file is opened, but not a folder).
 * 2. Multiple chroots are detected - this happens in multiroot
 *    workspace. We show an error message and use one of the chroots.
 */
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

  /**
   * Returns an accessor to files under source. Don't store the returned value,
   * as it might change when user opens different workspace.
   */
  source(): WrapFs<commonUtil.Source> | undefined {
    return this.sourceFs;
  }

  private setPaths(chroot?: commonUtil.Chroot) {
    // Context for the custom `when` clause in boards and packages view.
    void vscode.commands.executeCommand(
      'setContext',
      'cros-ide.chrootPath',
      chroot
    );
    this.chrootFs = chroot ? new WrapFs(chroot) : undefined;
    this.sourceFs = chroot
      ? new WrapFs(commonUtil.sourceDir(chroot))
      : undefined;
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
    const candidates = this.findChrootCandidates();
    const currentChroot = this.chroot()?.root;
    const selected: commonUtil.Chroot | undefined = candidates[0];

    if (candidates.length > 1) {
      // Do not await to avoid blocking activate().
      void vscode.window.showErrorMessage(
        'CrOS IDE does not support multiple chroots, ' +
          `but found: [${candidates.join(', ')}]. Selecting ${selected}. ` +
          'Open ChromeOS sources from at most one chroot per workspace to fix this problem.'
      );
      metrics.send({
        category: 'background',
        group: 'misc',
        action: 'multiple chroot candidates',
      });
    }

    // Make sure we don't change a defined chroot. This scenario happens
    // when adding and removing folders under distinct chroots.
    // (The first folder needs to be non-CrOS, because when it changes,
    // then the extensions restart.)
    if (currentChroot && currentChroot !== selected) {
      void vscode.window.showErrorMessage(
        `Chroot change ${currentChroot} → ${selected} will be ignored. ` +
          'CrOS IDE requires reloading the window to change the chroot.'
      );
      metrics.send({
        category: 'background',
        group: 'misc',
        action: 'chroot change rejected',
      });
      return;
    }

    // TODO(b:235773376): Make sure users of this service show a warning if invoked,
    // when chroot is not available.
    this.setPaths(selected);
  }

  private findChrootCandidates(): commonUtil.Chroot[] {
    if (this.isInsideChroot()) {
      return ['/' as commonUtil.Chroot];
    }

    const candidates: commonUtil.Chroot[] = [];
    for (const folder of vscode.workspace.workspaceFolders || []) {
      const r = commonUtil.findChroot(folder.uri.fsPath);
      if (r !== undefined && candidates.indexOf(r) === -1) {
        candidates.push(r);
      }
    }

    return candidates;
  }
}
