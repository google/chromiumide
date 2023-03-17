// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as bgTaskStatus from '../../ui/bg_task_status';
import {TaskStatus} from '../../ui/bg_task_status';
import * as metrics from '../metrics/metrics';

// Task name in the status manager.
export const GERRIT = 'Gerrit';

/**
 * Helper for showing error messages, sending metrics,
 * and updating the IDE status.
 *
 * It used to be a method in Gerrit class, but it was extracted
 * for testability.
 */
export class ErrorMessageRouter {
  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    private readonly statusManager: bgTaskStatus.StatusManager
  ) {}

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

    this.outputChannel.appendLine(m.log);
    if (!m.noErrorStatus) {
      this.statusManager.setStatus(GERRIT, TaskStatus.ERROR);
    }
    if (m.metrics) {
      metrics.send({
        category: 'error',
        group: 'gerrit',
        description: m.metrics,
      });
    }
  }
}
