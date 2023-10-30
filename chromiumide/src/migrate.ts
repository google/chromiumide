// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as config from './services/config';

/**
 * Entrypoint for starting migration if the user's environment is not compatible
 * with the expectation of the current version of the extension. For example if
 * the user contains settings starting from "cros-ide.", the prefix will be
 * renamed to "chromiumide.".
 *
 * This function should be called first when the extension is activated.
 */
export async function migrate(): Promise<void> {
  await migrateConfiguration();
}

async function migrateConfiguration(): Promise<void> {
  const configs: config.ConfigValue<unknown>[] = [
    config.board,
    config.leagcyBoardsAndPackages.showWelcomeMessage,
    config.boilerplate.enabled,
    config.boilerplate.guessNamespace,
    config.chrome.ashBuildDir,
    config.chrome.dutName,
    config.chrome.outputDirectories,
    config.codeSearch.instance,
    config.codeSearch.openWithRevision,
    config.gerrit.enabled,
    config.ownersFiles.links,
    config.platformEc.board,
    config.platformEc.mode,
    config.platformEc.build,
    config.spellchecker,
    config.testCoverage.enabled,
    config.underDevelopment.chromiumBuild,
    config.underDevelopment.platform2GtestDebugging,
    config.underDevelopment.platformEc,
    config.underDevelopment.relatedFiles,
    config.underDevelopment.systemLogViewer,
    config.deviceManagement.devices,
    config.metrics.collectMetrics,
    config.metrics.showMessage,
    config.paths.depotTools,
  ];

  let shouldMigrate = false;
  for (const conf of configs) {
    const v = conf.inspectOldConfig();

    if (v === undefined) continue;

    if (
      v.globalValue === undefined &&
      v.workspaceValue === undefined &&
      v.workspaceFolderValue === undefined
    ) {
      continue;
    }

    shouldMigrate = true;
    break;
  }

  if (!shouldMigrate) return;

  await vscode.window.withProgress(
    {
      title: "Migrating IDE config (don't close the window)",
      location: vscode.ProgressLocation.Notification,
    },
    async (progress, _token) => {
      const increment = 100 / configs.length;

      for (const conf of configs) {
        progress.report({increment});

        const c = conf.inspectOldConfig();

        if (c === undefined) continue;

        if (c.globalValue !== undefined) {
          await conf.update(c.globalValue, vscode.ConfigurationTarget.Global);
          await conf.updateOldConfig(
            undefined,
            vscode.ConfigurationTarget.Global
          );
        }

        if (c.workspaceValue !== undefined) {
          await conf.update(
            c.workspaceValue,
            vscode.ConfigurationTarget.Workspace
          );
          await conf.updateOldConfig(
            undefined,
            vscode.ConfigurationTarget.Workspace
          );
        }

        if (c.workspaceFolderValue !== undefined) {
          await conf.update(
            c.workspaceFolderValue,
            vscode.ConfigurationTarget.WorkspaceFolder
          );
          await conf.updateOldConfig(
            undefined,
            vscode.ConfigurationTarget.WorkspaceFolder
          );
        }
      }
    }
  );
}
