// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ProductWatcher} from '../watchers';
import {ChrootService} from './chroot';

export type Services = {
  /**
   * Filepath to the chromiumos directory.
   */
  root: string;
  chrootService?: ChrootService;
};

/**
 * This module provides access to all the chromiumos services.
 *
 * User of the class should subscribe to the event in this instance to be
 * notified when the module is updated upon the change of the chromiumos
 * directory.
 *
 * Note that the event should be synchronously subscribed after the class is
 * constructed so that the subscriber can receive the first event.
 */
export class ChromiumosServiceModule implements vscode.Disposable {
  private readonly watcher = new ProductWatcher('chromiumos');

  private services?: Services;

  private readonly subscriptions: vscode.Disposable[] = [this.watcher];
  private readonly onDidUpdateEmitter = new vscode.EventEmitter<
    Services | undefined
  >();
  /**
   * Event emitted when the services are updated.
   */
  readonly onDidUpdate = this.onDidUpdateEmitter.event;

  dispose(): void {
    this.disposeServices();
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  private disposeServices() {
    this.services?.chrootService?.dispose();
    this.services = undefined;
  }

  constructor() {
    this.subscriptions.push(
      this.watcher.onDidChangeRoot(root => {
        this.refresh(root);
      })
    );
  }

  private refresh(root?: string) {
    if (!root) {
      this.onDidUpdateEmitter.fire(undefined);
      this.disposeServices();
      return;
    }
    const chrootService = ChrootService.maybeCreate(root);
    const event = {
      root,
      chrootService,
    };
    this.onDidUpdateEmitter.fire(event);
    this.disposeServices();

    this.services = {
      root,
      chrootService,
    };
  }
}
