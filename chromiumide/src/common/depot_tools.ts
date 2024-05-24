// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../shared/app/common/common_util';
import {getDriver} from '../../shared/app/common/driver_repository';
import * as config from '../../shared/app/services/config';

const driver = getDriver();

const DEPOT_TOOLS_README_URL =
  'https://chromium.googlesource.com/chromium/tools/depot_tools/+/HEAD/README.md';

let promptedForMissingDepotTools = false;

/**
 * Expands the `PATH` environment variable to `<custom_setting>:$PATH:~/depot_tools`. This gives
 * preference to the custom setting and a fallback on a default.
 */
export async function extraEnvForDepotTools(): Promise<{PATH: string}> {
  let extraEnv = await depotToolsPath();

  // The `cros` command should be in depot tools and available.
  const whichCros = await commonUtil.exec('which', ['cros'], {
    extraEnv,
  });

  // If it's not prompt the user until ok or canceled.
  if (whichCros instanceof Error && !promptedForMissingDepotTools) {
    const validatedPath = await promptForDepotToolsPath();
    if (validatedPath) {
      await config.paths.depotTools.update(validatedPath);
      extraEnv = await depotToolsPath();
      await vscode.window.showInformationMessage(
        `Depot Tools path updated to: ${validatedPath}`
      );
    }
  }
  return extraEnv;
}

/**
 * Prompts the user for a path and check if `cros` is contained within.
 *
 * @returns A string path on successful attempt. `undefined` upon a user cancelation.
 */
async function promptForDepotToolsPath(): Promise<string | undefined> {
  promptedForMissingDepotTools = true;

  let resultPath = undefined;
  let candidatePath = config.paths.depotTools.get();
  do {
    let warnMsg = candidatePath
      ? `ChromiumIDE: The 'cros' command was not in:\n\n${candidatePath}\n\n`
      : 'ChromiumIDE: The depot tools path was not set. ';

    warnMsg += 'Select a valid depot_tools directory.';

    const choice = await vscode.window.showWarningMessage(
      warnMsg,
      {
        modal: true,
      },
      'Select directory',
      'Installation Instructions'
    );
    if (choice === 'Select directory') {
      const depotToolsUri = await vscode.window.showOpenDialog({
        title: 'ChromiumIDE: Please select the depot_tools directory',
        defaultUri: vscode.Uri.parse(os.homedir()),
        canSelectMany: false,
        canSelectFiles: false,
        canSelectFolders: true,
      });

      if (depotToolsUri) {
        candidatePath = depotToolsUri[0].fsPath;
        const expectedCrosPath = path.join(candidatePath, 'cros');

        const crosExists = await fs.statSync(expectedCrosPath, {
          throwIfNoEntry: false,
        });

        // If the path doesn't appear to contain depot tools, warn...
        if (crosExists && crosExists.isFile()) {
          resultPath = candidatePath;
        }
      }
    } else if (choice === 'Installation Instructions') {
      await vscode.env.openExternal(vscode.Uri.parse(DEPOT_TOOLS_README_URL));
    } else {
      break;
    }
  } while (!resultPath);

  return resultPath;
}

async function depotToolsPath(): Promise<{PATH: string}> {
  const depotToolsConfig = config.paths.depotTools.get();
  const pathVar = await driver.getUserEnvPath();
  const originalPath = pathVar instanceof Error ? undefined : pathVar;
  const homeDepotTools = path.join(os.homedir(), 'depot_tools');

  const expandedPath: string[] = [];
  if (depotToolsConfig) {
    expandedPath.push(depotToolsConfig);
  }
  if (originalPath) {
    expandedPath.push(originalPath);
  }
  expandedPath.push(homeDepotTools);

  return {
    PATH: expandedPath.join(':'),
  };
}

/**
 * For testing, reset the prompted state.
 */
function resetpromptedForMissingDepotTools(): void {
  promptedForMissingDepotTools = false;
}

export const TEST_ONLY = {resetpromptedForMissingDepotTools};
