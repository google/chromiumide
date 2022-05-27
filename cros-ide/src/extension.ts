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
import * as commonUtil from './common/common_util';
import * as boardsPackages from './features/boards_packages';
import * as codesearch from './features/codesearch';
import * as coverage from './features/coverage';
import * as cppCodeCompletion from './features/cpp_code_completion/cpp_code_completion';
import * as crosFormat from './features/cros_format';
import * as crosLint from './features/cros_lint';
import * as deviceManagement from './features/device_management';
import * as feedback from './features/metrics/feedback';
import * as metrics from './features/metrics/metrics';
import * as shortLinkProvider from './features/short_link_provider';
import * as suggestExtension from './features/suggest_extension';
import * as targetBoard from './features/target_board';
import * as upstart from './features/upstart';
import * as ideUtil from './ide_util';
import * as chroot from './services/chroot';
import * as bgTaskStatus from './ui/bg_task_status';

export interface ExtensionApi {
  // ExtensionContext passed to the activation function.
  // Available only when the extension is activated for testing.
  context?: vscode.ExtensionContext;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi> {
  if (commonUtil.isInsideChroot()) {
    vscode.window.showErrorMessage(
      'Running VSCode inside chroot is no longer supported; please read go/cros-ide-quickstart and update your setup',
      {modal: true}
    );
    return {};
  }

  const statusManager = bgTaskStatus.activate(context);
  const chrootService = chroot.activate(context);

  // Activate metrics first so that other components can emit metrics on activation.
  metrics.activate(context);

  vscode.commands.registerCommand(ideUtil.SHOW_UI_LOG.command, () =>
    ideUtil.getUiLogger().show()
  );

  // We need an item in the IDE status, which lets users discover the UI log. Since UI actions
  // which result in an error should show a popup, we will not be changing the status
  statusManager.setTask('UI Actions', {
    status: bgTaskStatus.TaskStatus.OK,
    command: ideUtil.SHOW_UI_LOG,
  });

  crosLint.activate(context, statusManager);
  boardsPackages.activate(chrootService);
  shortLinkProvider.activate(context);
  codesearch.activate(context);
  cppCodeCompletion.activate(context, statusManager, chrootService);
  suggestExtension.activate(context);
  targetBoard.activate(context, chrootService);
  feedback.activate(context);
  upstart.activate(context);
  deviceManagement.activate(context);

  if (ideUtil.getConfigRoot().get<boolean>('underDevelopment.testCoverage')) {
    coverage.activate(context);
  }

  if (ideUtil.getConfigRoot().get<boolean>('underDevelopment.crosFormat')) {
    crosFormat.activate(context);
  }

  // Avoid network operations in tests.
  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    checkUpdates.run(context);
  }

  metrics.send({
    category: 'extension',
    action: 'activate',
    label: context.extension.packageJSON.version,
  });

  return {
    context:
      context.extensionMode === vscode.ExtensionMode.Test ? context : undefined,
  };
}
