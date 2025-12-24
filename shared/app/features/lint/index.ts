// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import {getDriver} from '../../common/driver_repository';
import {extensionName} from '../../common/extension_name';
import * as logs from '../../common/logs';
import * as config from '../../services/config';
import {TextEditorsWatcher} from '../../services/watchers/text_editors_watcher';
import * as bgTaskStatus from '../../ui/bg_task_status';
import {TaskStatus} from '../../ui/bg_task_status';
import {CrosLintConfig} from './cros_lint_config';
import {LibchromeLintConfig} from './libchrome_lint_config';
import {LintConfig} from './lint_config';
import {TastLintConfig} from './tast_lint_config';

const driver = getDriver();

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  log: logs.LoggingBundle
): void {
  const collection = vscode.languages.createDiagnosticCollection('cros-lint');
  if (vscode.window.activeTextEditor) {
    void updateDiagnosticsWrapper(
      vscode.window.activeTextEditor.document,
      collection,
      statusManager,
      log
    );
  }
  // TODO(ttylenda): Add integration test to verify that we run linters on events.
  const textEditorsWatcher = TextEditorsWatcher.singleton();
  context.subscriptions.push(
    textEditorsWatcher.onDidActivate(document => {
      void updateDiagnosticsWrapper(document, collection, statusManager, log);
    }),
    vscode.workspace.onDidSaveTextDocument(document => {
      void updateDiagnosticsWrapper(document, collection, statusManager, log);
    }),
    textEditorsWatcher.onDidClose(document => {
      collection.delete(document.uri);
    }),
    config.lint.enabled.onDidChange(enabled => {
      if (!enabled) {
        // Empty all diagnostics if user switched off linting.
        collection.clear();
        return;
      } else if (vscode.window.activeTextEditor) {
        // Updating diagnostics for the active document if user switched on linting.
        void updateDiagnosticsWrapper(
          vscode.window.activeTextEditor.document,
          collection,
          statusManager,
          log
        );
      }
    })
  );
}

const LINT_CONFIGS: readonly LintConfig[] = [
  new CrosLintConfig('cpp'),
  new CrosLintConfig('gn'),
  new CrosLintConfig('go'),
  new CrosLintConfig('python'),
  new CrosLintConfig('shellscript'),
  new LibchromeLintConfig(),
  new TastLintConfig(),
];

const languageToLintConfigs: Map<string, LintConfig[]> = (() => {
  const map = new Map<string, LintConfig[]>();
  for (const lintConfig of LINT_CONFIGS) {
    const lintConfigs = map.get(lintConfig.languageId) || [];
    lintConfigs.push(lintConfig);
    map.set(lintConfig.languageId, lintConfigs);
  }
  return map;
})();

// Wrapper to handle any errors thrown by updateDiagnostics.
async function updateDiagnosticsWrapper(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  statusManager: bgTaskStatus.StatusManager,
  log: logs.LoggingBundle
): Promise<void> {
  // Clear collection if lint is disabled.
  if (!config.lint.enabled.get()) {
    collection.clear();
    return;
  }
  try {
    await updateDiagnostics(document, collection, statusManager, log);
  } catch (err) {
    log.channel.append(`${err}\n`);
    statusManager.setTask(log.taskId, {
      status: TaskStatus.ERROR,
      command: log.showLogCommand,
    });
    driver.metrics.send({
      category: 'error',
      group: 'lint',
      description: 'error was thrown',
      name: 'lint_update_diagnostic_error',
    });
  }
}

// TODO(ttylenda): Consider making it a class and move statusManager and log to the constructor.
async function updateDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  statusManager: bgTaskStatus.StatusManager,
  log: logs.LoggingBundle
): Promise<void> {
  if (document && document.uri.scheme === 'file') {
    const lintConfigs = languageToLintConfigs.get(document.languageId);
    if (!lintConfigs) {
      // Sent metrics just to track languages.
      driver.metrics.send({
        category: 'background',
        group: 'lint',
        description: 'skip',
        name: 'lint_skip',
        language_id: document.languageId,
      });
      return;
    }

    // Do not lint generated files, because it generates lots of useless warnings.
    if (
      document.fileName.includes('/chroot/build/') ||
      document.fileName.includes('/out/build/')
    ) {
      return;
    }

    const diagnosticsCollection: vscode.Diagnostic[] = [];
    for (const lintConfig of lintConfigs) {
      const cmd = await lintConfig.command(document, log.channel);
      if (!cmd) {
        continue;
      }
      log.channel.appendLine(
        `Applying ${lintConfig.name} lint executable to ${document.languageId} file ${document.fileName}`
      );

      const res = await commonUtil.exec(cmd.name, cmd.args, {
        logger: log.channel,
        ignoreNonZeroExit: true,
        logStdout: true,
        cwd: cmd.cwd,
        extraEnv: cmd.extraEnv,
      });
      if (res instanceof Error) {
        log.channel.append(res.message);
        statusManager.setTask(log.taskId, {
          status: TaskStatus.ERROR,
          command: log.showLogCommand,
        });
        return;
      }
      const {stdout, stderr} = res;
      const diagnostics = lintConfig.parse(stdout, stderr, document);
      if (res.exitStatus !== 0 && diagnostics.length === 0) {
        log.channel.append(
          `lint command returned ${
            res.exitStatus
          }, but no diagnostics were parsed by ${extensionName()}\n`
        );
        if (!lintConfig.ignoreEmptyDiagnostics) {
          statusManager.setTask(log.taskId, {
            status: TaskStatus.ERROR,
            command: log.showLogCommand,
          });
          driver.metrics.send({
            category: 'error',
            group: 'lint',
            description: `non-zero linter exit, but no diagnostics (${document.languageId})`,
            name: 'lint_missing_diagnostics',
          });
          return;
        }
      }
      diagnosticsCollection.push(...diagnostics);
    }

    collection.set(document.uri, diagnosticsCollection);
    statusManager.setTask(log.taskId, {
      status: TaskStatus.OK,
      command: log.showLogCommand,
    });
    driver.metrics.send({
      category: 'background',
      group: 'lint',
      description: 'update',
      name: 'lint_update',
      language_id: document.languageId,
      length: diagnosticsCollection.length,
    });
  }
}
