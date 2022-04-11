// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * This is the main entry point for the vsCode plugin.
 *
 * Keep this minimal - breakout GUI and App-Behavior to separate files.
 */
import * as vscode from 'vscode';
import * as checkUpdates from './check_updates';
import * as boardsPackages from './features/boards_packages';
import * as codesearch from './features/codesearch';
import * as coverage from './features/coverage';
import * as cppCodeCompletion from './features/cpp_code_completion';
import * as crosLint from './features/cros_lint';
import * as dutManager from './features/dut_management/dut_manager';
import * as feedback from './features/metrics/feedback';
import * as metrics from './features/metrics/metrics';
import * as shortLinkProvider from './features/short_link_provider';
import * as suggestExtension from './features/suggest_extension';
import * as targetBoard from './features/target_board';
import * as ideUtilities from './ide_utilities';
import * as bgTaskStatus from './ui/bg_task_status';

export function activate(context: vscode.ExtensionContext) {
  const statusManager = bgTaskStatus.activate(context);

  vscode.commands.registerCommand(
      ideUtilities.SHOW_UI_LOG.command,
      () => ideUtilities.getUiLogger().show());

  // We need an item in the IDE status, which lets users discover the UI log. Since UI actions
  // which result in an error should show a popup, we will not be changing the status
  statusManager.setTask('UI Actions',
      {status: bgTaskStatus.TaskStatus.OK, command: ideUtilities.SHOW_UI_LOG});

  crosLint.activate(context, statusManager);
  boardsPackages.activate();
  shortLinkProvider.activate(context);
  codesearch.activate(context);
  cppCodeCompletion.activate(context, statusManager);
  suggestExtension.activate(context);
  targetBoard.activate(context);
  feedback.activate(context);
  metrics.activate(context);

  if (ideUtilities.getConfigRoot().get<boolean>('underDevelopment.dutManager')) {
    dutManager.activateDutManager(context);
  }

  if (ideUtilities.getConfigRoot().get<boolean>('underDevelopment.testCoverage')) {
    coverage.activate(context);
  }

  checkUpdates.run(context);
  metrics.send({category: 'extension', action: 'activate'});
}
