// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Driver} from '../driver';
import {registerDriver} from './common/driver_repository';
import {LoggingBundle, createLinterLoggingBundle} from './common/logs';
import * as feedback from './common/metrics/feedback';
import * as crosLint from './features/cros_lint';
import {DemoWhoami} from './features/demo_whoami';
import * as bgTaskStatus from './ui/bg_task_status';

/**
 * Activates features shared between internal IDE and VSCode.
 */
export function activate(
  context: vscode.ExtensionContext,
  driver: Driver
): {statusManager: bgTaskStatus.StatusManager; linterLogger: LoggingBundle} {
  registerDriver(driver);

  context.subscriptions.push(new DemoWhoami());

  feedback.activate(context);

  const statusManager = bgTaskStatus.activate(context);
  // The logger that should be used by linters/code-formatters.
  const linterLogger = createLinterLoggingBundle(context);
  crosLint.activate(context, statusManager, linterLogger);
  return {statusManager, linterLogger};
}
