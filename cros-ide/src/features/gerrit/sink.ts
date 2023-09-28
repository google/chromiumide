// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as bgTaskStatus from '../../ui/bg_task_status';
import {TaskStatus} from '../../ui/bg_task_status';
import {Metrics} from '../metrics/metrics';

// Task name in the status manager.
const GERRIT = 'Gerrit';

/**
 * Represents the means to report logs or errors.
 */
export class Sink implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel(
    'ChromiumIDE: Gerrit'
  );

  constructor(
    private readonly statusManager: bgTaskStatus.StatusManager,
    subscriptions?: vscode.Disposable[]
  ) {
    if (subscriptions) {
      subscriptions.push(this);
    }
    statusManager.setTask(GERRIT, {
      status: TaskStatus.OK,
      outputChannel: this.output,
    });
  }

  /**
   * Append the given value to the output channel.
   */
  append(value: string): void {
    this.output.append(value);
  }

  /**
   * Append the given value and a line feed character to the output channel.
   */
  appendLine(value: string): void {
    this.output.appendLine(value);
  }

  /**
   * Show `message.log` in the IDE, set task status to error
   * (unless disabled with `noErrorStatus`),
   * and send `message.metrics` via metrics if it is set.
   *
   * If `message` is a string, it is used both in the log and metrics.
   */
  show(
    message: string | {log: string; metrics?: string; noErrorStatus?: boolean}
  ): void {
    const m: {log: string; metrics?: string; noErrorStatus?: boolean} =
      typeof message === 'string' ? {log: message, metrics: message} : message;

    this.output.appendLine(m.log);
    if (!m.noErrorStatus) {
      this.statusManager.setStatus(GERRIT, TaskStatus.ERROR);
    }
    if (m.metrics) {
      Metrics.send({
        category: 'error',
        group: 'gerrit',
        description: m.metrics,
        name: 'gerrit_show_error',
      });
    }
  }

  clearErrorStatus(): void {
    this.statusManager.setStatus(GERRIT, TaskStatus.OK);
  }

  dispose(): void {
    vscode.Disposable.from(this.output).dispose();
  }
}
