// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../common/common_util';
import {Metrics} from '../../../features/metrics/metrics';

export type Event = {
  /**
   * The commit hash of the HEAD.
   */
  readonly head: string;
};

/**
 * Watches HEAD of the given git repository and fires events on its changes.
 */
export class Watcher implements vscode.Disposable {
  readonly subscriptions: vscode.Disposable[] = [];
  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  private readonly onDidChangeEmitter = new vscode.EventEmitter<Event>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly root: string) {
    // We cannot directly watch .git/logs/HEAD here because the inode of the
    // file changes and fs.watch cannot track the change.
    const gitLogs = path.join(root, '.git/logs');

    // If the git repository does not have any commit (the state just after
    // git init), the directory doesn't exist and we cannot watch it.
    if (!fs.existsSync(gitLogs)) {
      Metrics.send({
        group: 'git_watcher',
        category: 'error',
        name: 'git_watcher_no_commit',
        description: 'No commit found on a git repository',
      });
      return;
    }
    const watcher = fs.watch(gitLogs, (_event, filename) => {
      // .git/logs/HEAD should always exist and record changes on HEAD.
      // https://git-scm.com/docs/gitrepository-layout
      if (filename === 'HEAD') {
        void this.handle();
      }
    });
    this.subscriptions.push({
      dispose(): void {
        watcher.close();
      },
    });

    setImmediate(() => void this.handle());
  }

  // Ensures events are fired in order.
  private readonly mutex = new commonUtil.Mutex();
  private async handle() {
    await this.mutex.runExclusive(async () => {
      const head = await commonUtil.exec('git', ['rev-parse', 'HEAD'], {
        cwd: this.root,
      });
      if (head instanceof Error) {
        this.showErrorGloballyOnce(head);
        return;
      }
      this.onDidChangeEmitter.fire({head: head.stdout.trim()});
    });
  }

  private static gitCommandErrorReported = false;
  private showErrorGloballyOnce(e: Error) {
    if (Watcher.gitCommandErrorReported) {
      return;
    }
    Watcher.gitCommandErrorReported = true;
    void vscode.window.showErrorMessage(
      `ChromiumIDE failed to read HEAD to spellcheck commit message, etc. (${this.root}): ${e}`
    );
  }
}
