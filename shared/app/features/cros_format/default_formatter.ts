// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Platform} from '../../../driver';
import {getDriver} from '../../common/driver_repository';
import * as config from '../../services/config';

/**
 * Utilities to update or suggest to update the default formatter to this extension.
 */

const driver = getDriver();

export async function maybeConfigureOrSuggestSettingDefaultFormatter(
  folders: Readonly<vscode.WorkspaceFolder[]>,
  extensionId: string,
  output?: vscode.OutputChannel,
  platform = driver.platform()
): Promise<void> {
  const alwaysDefaultOptionEnabled = platform === Platform.CIDER;
  output?.appendLine(
    `New workspace folders added (${folders
      .map(f => f.uri.path)
      .join(
        ', '
      )}). Current default formatter is ${config.vscode.editor.defaultFormatter.get()} and suggest setting chromiumide as default is ${
      config.crosFormat.suggestSetAsDefault.get() ? 'enabled' : 'disabled'
    }.`
  );
  if (alwaysDefaultOptionEnabled) {
    output?.appendLine(
      `Always set as default in CrOS workspace option is ${
        config.crosFormat.alwaysDefaultInCros.get() ? 'enabled' : 'disabled'
      } and we have ${
        config.crosFormat.hasBeenSetAsDefaultInThisWorkspace.get() ? '' : 'not'
      } set it to ${extensionId} at least once.`
    );
  }

  // Exit early if any of the following is true
  //   * chromiumide is already the default formatter,
  //   * user has disabled the suggestion,
  //   * on cider, user has enabled the "always set as default in CrOS workspaces" option and it has
  //     been set at least once by the extension.
  if (
    config.vscode.editor.defaultFormatter.get() === extensionId ||
    !config.crosFormat.suggestSetAsDefault.get() ||
    (alwaysDefaultOptionEnabled &&
      config.crosFormat.alwaysDefaultInCros.get() &&
      config.crosFormat.hasBeenSetAsDefaultInThisWorkspace.get())
  ) {
    return;
  }

  // If user has enabled the "always set as default in CrOS workspaces" option (cider only).
  if (
    alwaysDefaultOptionEnabled &&
    config.crosFormat.alwaysDefaultInCros.get()
  ) {
    if (
      !config.crosFormat.hasBeenSetAsDefaultInThisWorkspace.get() &&
      (await hasCrOSFolder(folders, output))
    ) {
      // If there is a CrOS folder opened, and the default formatter has not been updated by the
      // extension yet, do it automatically.
      await config.vscode.editor.defaultFormatter.update(extensionId);
      // This ensures user can change the default formatter in individual workspaces even if they want
      // the setting to be true in general.
      await config.crosFormat.hasBeenSetAsDefaultInThisWorkspace.update(true);
      return;
    } else {
      // Return early since user should not be asked to update the per-workspace after enabling the
      // more aggressive option.
      return;
    }
  }

  // If the workspace folder is in a CrOS repo, and user has not disabled the per-workspace
  // suggestion, suggest setting cros format as the workspace default formatter.
  if (
    config.crosFormat.suggestSetAsDefault.get() &&
    (await hasCrOSFolder(folders, output))
  ) {
    await suggestSettingDefaultFormatterInThisWorkspace(
      extensionId,
      output,
      platform
    );
    return;
  }
}

async function suggestSettingDefaultFormatterInThisWorkspace(
  extensionId: string,
  output?: vscode.OutputChannel,
  platform = driver.platform()
): Promise<void> {
  const alwaysDefaultOptionEnabled = platform === Platform.CIDER;
  // If the workspace folder is in a CrOS repo, suggest setting cros format as the workspace
  // default formatter.
  const CHOICE_YES = 'Yes';
  const CHOICE_NO_WORKPLACE = "Don't ask again in this workspace";
  const CHOICE_NEVER = 'Never ask again';
  const choice = await vscode.window.showInformationMessage(
    'Do you want to set `cros format` as your default formatter in this workspace?',
    CHOICE_YES,
    CHOICE_NO_WORKPLACE,
    CHOICE_NEVER
  );
  if (choice === CHOICE_YES) {
    output?.appendLine(
      `Setting ${extensionId} as default formatter in workspace`
    );
    await config.vscode.editor.defaultFormatter.update(extensionId);
    // On cider, workspaces are created frequently.
    // Since user said yes to this prompt, they might want to always set the default formatter
    // automatically. Ask if they have not disabled the suggestion.
    if (
      alwaysDefaultOptionEnabled &&
      config.crosFormat.suggestAlwaysDefaultInCros.get()
    ) {
      await suggestSettingDefaultFormatterAlways();
    }
  } else if (choice === CHOICE_NO_WORKPLACE) {
    output?.appendLine(
      'Do not update default formatter and will not ask again in this workspace'
    );
    // Update workspace setting to not ask again.
    await config.crosFormat.suggestSetAsDefault.update(
      false,
      vscode.ConfigurationTarget.Workspace
    );
  } else if (choice === CHOICE_NEVER) {
    output?.appendLine(
      'Do not update default formatter and will not ask again in all workspaces'
    );
    // Note this setting is global and user will not be prompted to set the default formatter
    // in other workspaces.
    await config.crosFormat.suggestSetAsDefault.update(false);
  }
  return;
}

async function suggestSettingDefaultFormatterAlways(): Promise<void> {
  const CHOICE_YES = 'Yes';
  const CHOICE_NO = "Don't ask again";
  const choice = await vscode.window.showInformationMessage(
    'Do you want to always set `cros format` as your default formatter in all workspace with CrOS repo opened?',
    CHOICE_YES,
    CHOICE_NO
  );
  if (choice === CHOICE_YES) {
    await config.crosFormat.alwaysDefaultInCros.update(true);
  } else if (choice === CHOICE_NO) {
    await config.crosFormat.suggestAlwaysDefaultInCros.update(false);
  }
  return;
}

async function hasCrOSFolder(
  folders: Readonly<vscode.WorkspaceFolder[]>,
  output?: vscode.OutputChannel
): Promise<boolean> {
  for (const folder of folders) {
    if ((await driver.cros.findSourceDir(folder.uri.fsPath)) !== undefined) {
      output?.appendLine(
        `New folder ${folder.uri.path} is in a CrOS repository.`
      );
      return true;
    }
  }
  output?.appendLine('No new folder is in a CrOS repository.');
  return false;
}
