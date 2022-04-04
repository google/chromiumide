// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as ideUtilities from '../ide_utilities';

export function activate(context: vscode.ExtensionContext): StatusManager {
  vscode.commands.registerCommand('cros-ide.showIdeLog', () => {
    ideUtilities.getLogger().show();
  });

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  statusBarItem.command = 'cros-ide.showIdeLog';
  statusBarItem.show();

  return new StatusManager(statusBarItem);
}

/**
 * Manages a status bar item showing if the IDE works well or not.
 * Clicking on the status bar item takes the user to the log of
 * background tasks (emerge, and so on).
 *
 * This functionality is meant for continuously running background tasks,
 * which should not overuse popups.
 */
// TODO(ttylenda): test this class
export class StatusManager {
  private unhealthyTasks = new Set<string>();

  constructor(private readonly statusBarItem: vscode.StatusBarItem) {
    this.refresh();
  }

  addError(taskId: string) {
    this.unhealthyTasks.add(taskId);
    this.refresh();
  }

  deleteError(taskId: string) {
    this.unhealthyTasks.delete(taskId);
    this.refresh();
  }

  /**
   * Adjusts appearance of the status bar based presence of unhealthy tasks.
   *
   * It is possible to have one more status indicating warning, but we keep
   * things simple for now.
   */
  private refresh() {
    if (this.unhealthyTasks.size) {
      this.statusBarItem.text = '$(error) CrOS IDE';
      this.statusBarItem.tooltip = 'Background Tasks (Errors)';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else {
      this.statusBarItem.text = '$(check) CrOS IDE';
      this.statusBarItem.tooltip = 'Background Tasks (No Problems)';
      this.statusBarItem.backgroundColor = undefined;
    }
  }
}
