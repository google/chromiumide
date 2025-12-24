// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as head from './head';
import * as visible from './visible';
import {VisibleGitDirsChangeEvent} from './visible';

/**
 * Watches git directories under the given root and fires events on their
 * changes. It only watches git directories relevant to the currently visible
 * text editors.
 *
 * Formally speaking, this class tracks the set of all the visible git
 * directories and fires an event when it changes, where we say a git directory
 * is visible when both of the following conditions are met:
 *
 * 1. The directory is under the given root.
 * 2. There is at least one visible text editor (including virtual document)
 *    whose fileName is under the directory.
 *
 * The implementation leverages visible.ts to track changes to visible git repos
 * and creates head watchers for each of them (updating them as documents are
 * opened and closed).
 */
export class GitDirsWatcher implements vscode.Disposable {
  constructor(
    private readonly root: string,
    subscriptions?: vscode.Disposable[]
  ) {
    if (subscriptions) {
      subscriptions.push(this);
    }
  }

  private visibleGitDirsWatcher = new visible.Watcher(this.root);

  /**
   * Visible git directories.
   */
  get visibleGitDirs(): readonly string[] {
    return this.visibleGitDirsWatcher.visibleGitDirs;
  }

  /**
   * Fires when visible git directories change.
   */
  readonly onDidChangeVisibleGitDirs: vscode.Event<VisibleGitDirsChangeEvent> =
    this.visibleGitDirsWatcher.onDidChange;

  private readonly onDidChangeHeadEmitter =
    new vscode.EventEmitter<GitHeadChangeEvent>();
  /**
   * Fires when HEAD of a visible git directory changes.
   */
  readonly onDidChangeHead = this.onDidChangeHeadEmitter.event;

  private readonly gitDirToHeadWatcher = new Map<string, head.Watcher>();

  private readonly subscriptions: vscode.Disposable[] = [
    this.visibleGitDirsWatcher,
    this.visibleGitDirsWatcher.onDidChange(e => {
      e.added.forEach(gitDir => this.add(gitDir));
      e.removed.forEach(gitDir => this.remove(gitDir));
    }),
  ];
  dispose(): void {
    for (const watcher of this.gitDirToHeadWatcher.values()) {
      watcher.dispose();
    }
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }

  private add(gitDir: string) {
    if (this.gitDirToHeadWatcher.has(gitDir)) {
      return;
    }
    const watcher = new head.Watcher(gitDir);
    this.gitDirToHeadWatcher.set(gitDir, watcher);

    watcher.subscriptions.push(
      watcher.onDidChange(e => {
        this.onDidChangeHeadEmitter.fire({
          gitDir,
          head: e.head,
        });
      })
    );
  }

  private remove(gitDir: string) {
    const watcher = this.gitDirToHeadWatcher.get(gitDir);
    if (!watcher) {
      return;
    }
    this.gitDirToHeadWatcher.delete(gitDir);
    watcher.dispose();

    this.onDidChangeHeadEmitter.fire({
      gitDir,
      head: undefined,
    });
  }
}

export type GitHeadChangeEvent = {
  /**
   * Absolute path to the git directory.
   */
  readonly gitDir: string;
  /**
   * Commit hash of the HEAD or undefined to indicate the git directory is no
   * longer watched.
   */
  readonly head: string | undefined;
};
