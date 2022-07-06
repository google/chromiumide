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
import * as cipd from './common/cipd';
import * as commonUtil from './common/common_util';
import * as boardsPackages from './features/boards_packages';
import * as codesearch from './features/codesearch';
import * as coverage from './features/coverage';
import * as cppCodeCompletion from './features/cpp_code_completion/cpp_code_completion';
import * as crosFormat from './features/cros_format';
import * as crosLint from './features/cros_lint';
import * as deviceManagement from './features/device_management';
import * as gn from './features/gn';
import * as hints from './features/hints';
import * as feedback from './features/metrics/feedback';
import * as metrics from './features/metrics/metrics';
import * as shortLinkProvider from './features/short_link_provider';
import * as suggestExtension from './features/suggest_extension';
import * as targetBoard from './features/target_board';
import * as upstart from './features/upstart';
import * as ideUtil from './ide_util';
import * as chroot from './services/chroot';
import * as config from './services/config';
import * as bgTaskStatus from './ui/bg_task_status';
import * as logs from './logs';

export interface ExtensionApi {
  // ExtensionContext passed to the activation function.
  // Available only when the extension is activated for testing.
  context?: vscode.ExtensionContext;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionApi> {
  if (commonUtil.isInsideChroot()) {
    const openDocument = 'Open document';
    vscode.window
      .showWarningMessage(
        'Support for running VSCode inside chroot is dropped in the next release that comes soon; please read go/cros-ide-quickstart and update your setup.',
        {modal: true},
        openDocument
      )
      .then(x => {
        if (x === openDocument) {
          vscode.env.openExternal(
            vscode.Uri.parse('http://go/cros-ide-quickstart')
          );
        }
      });
  }

  const statusManager = bgTaskStatus.activate(context);
  const chrootService = chroot.activate(context);
  const cipdRepository = new cipd.CipdRepository();

  // Activate metrics first so that other components can emit metrics on activation.
  metrics.activate(context);

  vscode.commands.registerCommand(ideUtil.SHOW_UI_LOG.command, () =>
    ideUtil.getUiLogger().show()
  );

  // The logger that should be used by linters/code-formatters.
  const linterLogger = logs.createLinterLoggingBundle(context);

  // We need an item in the IDE status, which lets users discover the UI log. Since UI actions
  // which result in an error should show a popup, we will not be changing the status
  statusManager.setTask('UI Actions', {
    status: bgTaskStatus.TaskStatus.OK,
    command: ideUtil.SHOW_UI_LOG,
  });

  crosLint.activate(context, statusManager, linterLogger);
  gn.activate(context, statusManager, linterLogger);
  boardsPackages.activate(context, chrootService);
  shortLinkProvider.activate(context);
  codesearch.activate(context);
  cppCodeCompletion.activate(context, statusManager, chrootService);
  suggestExtension.activate(context);
  targetBoard.activate(context, chrootService);
  feedback.activate(context);
  upstart.activate(context);
  deviceManagement.activate(
    context,
    statusManager,
    chrootService,
    cipdRepository
  );
  hints.activate(context);

  if (config.underDevelopment.testCoverage.get()) {
    new coverage.Coverage(chrootService, statusManager).activate(context);
  }

  if (config.underDevelopment.crosFormat.get()) {
    crosFormat.activate(context);
  }

  // Avoid network operations in tests.
  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    checkUpdates.run(chrootService);
  }

  metrics.send({
    category: 'background',
    group: 'misc',
    action: 'activate',
  });

  return {
    context:
      context.extensionMode === vscode.ExtensionMode.Test ? context : undefined,
  };
}
