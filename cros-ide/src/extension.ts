// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * This is the main entry point for the vsCode plugin.
 *
 * Keep this minimal - breakout GUI and App-Behavior to separate files.
 */
import * as vscode from 'vscode';
import * as boardsPackages from './boards_packages';
import * as checkUpdates from './check_updates';
import * as codesearch from './codesearch';
import * as coverage from './coverage';
import * as cppCodeCompletion from './cpp_code_completion';
import * as crosLint from './cros_lint';
import * as dutManager from './dut_management/dut_manager';
import * as ideUtilities from './ide_utilities';
import * as feedback from './metrics/feedback';
import * as metrics from './metrics/metrics';
import * as shortLinkProvider from './short_link_provider';
import * as suggestExtension from './suggest_extension';
import * as targetBoard from './target_board';
import * as bgTaskStatus from './ui/bg_task_status';

export function activate(context: vscode.ExtensionContext) {
  crosLint.activate(context);
  boardsPackages.activate();
  shortLinkProvider.activate(context);
  codesearch.activate(context);
  cppCodeCompletion.activate(context);
  suggestExtension.activate(context);
  targetBoard.activate(context);
  bgTaskStatus.activate(context);
  feedback.activate(context);

  if (ideUtilities.getConfigRoot().get<boolean>('underDevelopment.dutManager')) {
    dutManager.activateDutManager(context);
  }

  if (ideUtilities.getConfigRoot().get<boolean>('underDevelopment.testCoverage')) {
    coverage.activate(context);
  }

  checkUpdates.run(context);
  metrics.send({category: 'extension', action: 'activate'});
}
