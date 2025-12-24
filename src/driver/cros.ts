// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../shared/app/common/common_util';
import {getDriver} from '../../shared/app/common/driver_repository';
import {extensionName} from '../../shared/app/common/extension_name';
import * as config from '../../shared/app/services/config';
import {Cros} from '../../shared/driver/cros';

const driver = getDriver();

export class CrosImpl implements Cros {
  async findChroot(path?: string): Promise<string | undefined> {
    if (path === undefined) return undefined;
    for (;;) {
      const chroot = driver.path.join(path, 'chroot');
      if (await commonUtil.isChroot(chroot)) {
        return chroot;
      }

      const d = driver.path.dirname(path);
      if (d === path) {
        break;
      }
      path = d;
    }
    return undefined;
  }
  async findSourceDir(path?: string): Promise<string | undefined> {
    if (path === undefined) return undefined;
    const chroot = await this.findChroot(path);
    if (chroot === undefined) {
      return undefined;
    }
    return driver.path.dirname(chroot);
  }

  async getDepotToolsPath(): Promise<string> {
    let path = await depotToolsPath();

    // The `cros` command should be in depot tools and available.
    const whichCros = await commonUtil.exec('which', ['cros'], {
      extraEnv: {PATH: path},
    });

    // If it's not prompt the user until ok or canceled.
    if (whichCros instanceof Error && !promptedForMissingDepotTools) {
      const validatedPath = await promptForDepotToolsPath();
      if (validatedPath) {
        await config.paths.depotTools.update(validatedPath);
        path = await depotToolsPath();
        await vscode.window.showInformationMessage(
          `Depot Tools path updated to: ${validatedPath}`
        );
      }
    }
    return path;
  }
}

export const DEPOT_TOOLS_README_URL =
  'https://chromium.googlesource.com/chromium/tools/depot_tools/+/HEAD/README.md';

export let promptedForMissingDepotTools = false;

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
      ? `${extensionName()}: The 'cros' command was not in:\n\n${candidatePath}\n\n`
      : `${extensionName()}: The depot tools path was not set. `;

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
        title: `${extensionName()}: Please select the depot_tools directory`,
        defaultUri: vscode.Uri.parse(driver.os.homedir()),
        canSelectMany: false,
        canSelectFiles: false,
        canSelectFolders: true,
      });

      if (depotToolsUri) {
        candidatePath = depotToolsUri[0].fsPath;
        const expectedCrosPath = driver.path.join(candidatePath, 'cros');

        // If the path doesn't appear to contain depot tools, warn...
        if (
          (await driver.fs.exists(expectedCrosPath)) &&
          !(await driver.fs.isDirectory(expectedCrosPath))
        ) {
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

async function depotToolsPath(): Promise<string> {
  const depotToolsConfig = config.paths.depotTools.get();
  const pathVar = await driver.getUserEnvPath();
  const originalPath = pathVar instanceof Error ? undefined : pathVar;
  const homeDepotTools = driver.path.join(driver.os.homedir(), 'depot_tools');

  const expandedPath: string[] = [];
  if (depotToolsConfig) {
    expandedPath.push(depotToolsConfig);
  }
  if (originalPath) {
    expandedPath.push(originalPath);
  }
  expandedPath.push(homeDepotTools);

  return expandedPath.join(':');
}

/**
 * For testing, reset the prompted state.
 */
function resetpromptedForMissingDepotTools(): void {
  promptedForMissingDepotTools = false;
}
export const TEST_ONLY = {resetpromptedForMissingDepotTools};
