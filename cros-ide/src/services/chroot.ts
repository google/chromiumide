// Copyright 2022 The ChromiumOS Authors
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

/**
 * Holds accessors to files related to chromiumOS.
 */
export type CrosFs = {
  chroot: WrapFs<commonUtil.Chroot>;
  source: WrapFs<commonUtil.Source>;
};

/**
 * Provides tools to operate chroot.
 */
export class ChrootService implements vscode.Disposable {
  private readonly subscriptions = new Array<vscode.Disposable>();
  private readonly onDidActivateEmitter = new vscode.EventEmitter<CrosFs>();
  /**
   * Event fired with CrosFs. Fired at most once asynchronously after the class is
   * constructed.
   */
  readonly onDidActivate = this.onDidActivateEmitter.event;

  constructor(
    private chrootFs: WrapFs<commonUtil.Chroot> | undefined,
    private sourceFs: WrapFs<commonUtil.Source> | undefined
  ) {
    this.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(_e => {
        this.onUpdate();
      })
    );
    if (!chrootFs) {
      setImmediate(() => this.onUpdate());
    }
  }

  dispose() {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

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

  private setPaths(chroot: commonUtil.Chroot) {
    // Context for the custom `when` clause in boards and packages view.
    void vscode.commands.executeCommand(
      'setContext',
      'cros-ide.chrootPath',
      chroot
    );
    this.chrootFs = new WrapFs(chroot);
    this.sourceFs = new WrapFs(commonUtil.sourceDir(chroot));

    this.onDidActivateEmitter.fire({
      chroot: this.chrootFs,
      source: this.sourceFs,
    });
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
    const source = this.source();
    if (source === undefined) {
      return new Error(
        'cros_sdk not found; open a directory under which chroot has been set up'
      );
    }
    return await execInChroot(source.root, name, args, options);
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
    if (currentChroot) {
      if (currentChroot !== selected) {
        void vscode.window.showErrorMessage(
          `Chroot change ${currentChroot} → ${selected} will be ignored. ` +
            'CrOS IDE requires reloading the window to change the chroot.'
        );
        metrics.send({
          category: 'background',
          group: 'misc',
          action: 'chroot change rejected',
        });
      }
      return;
    }

    if (!selected) {
      return;
    }
    this.setPaths(selected);
  }

  private findChrootCandidates(): commonUtil.Chroot[] {
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

/**
 * Executes command in chroot. Returns InvalidPasswordError in case the user
 * enters invalid password.
 */
export async function execInChroot(
  source: commonUtil.Source,
  name: string,
  args: string[],
  options: sudo.SudoExecOptions
): ReturnType<typeof commonUtil.exec> {
  const crosSdk = path.join(source, 'chromite/bin/cros_sdk');
  const crosSdkArgs = ['--', name, ...args];
  return sudo.execSudo(crosSdk, crosSdkArgs, options);
}
