// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {crosExeFromCrosRoot} from '../common/chromiumos/cros';
import * as commonUtil from '../common/common_util';
import {getDriver} from '../common/driver_repository';
import {extensionName} from '../common/extension_name';
import * as config from '../services/config';
import {StatusManager, TaskStatus} from '../ui/bg_task_status';
import {getUiLogger} from '../ui/log';

const driver = getDriver();

// Task name in the status manager.
const FORMATTER = 'Formatter';

// File containing wildcards, one per line, matching files that should be
// excluded from presubmit checks. Lines beginning with '#' are ignored.
const _IGNORE_FILE = '.presubmitignore';
const _IGNORED_WILDCARDS_CACHE = new Map<string, string[]>();

export function activate(
  context: vscode.ExtensionContext,
  statusManager: StatusManager
): void {
  const outputChannel = vscode.window.createOutputChannel(
    `${extensionName()}: Formatter`
  );
  statusManager.setTask(FORMATTER, {
    status: TaskStatus.OK,
    outputChannel,
  });

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      [{scheme: 'file'}],
      new CrosFormat(statusManager, outputChannel)
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(e =>
      maybeConfigureOrSuggestSettingDefaultFormatter(
        e.added,
        context.extension.id,
        outputChannel
      )
    )
  );
  void maybeConfigureOrSuggestSettingDefaultFormatter(
    vscode.workspace.workspaceFolders ?? [],
    context.extension.id,
    outputChannel
  );
}

async function hasCrOSFolder(
  folders: Readonly<vscode.WorkspaceFolder[]>,
  outputChannel?: vscode.OutputChannel
): Promise<boolean> {
  for (const folder of folders) {
    if ((await driver.cros.findSourceDir(folder.uri.fsPath)) !== undefined) {
      outputChannel?.appendLine(
        `New folder ${folder.uri.path} is in a CrOS repository.`
      );
      return true;
    }
  }
  outputChannel?.appendLine('No new folder is in a CrOS repository.');
  return false;
}

async function maybeConfigureOrSuggestSettingDefaultFormatter(
  folders: Readonly<vscode.WorkspaceFolder[]>,
  extensionId: string,
  outputChannel?: vscode.OutputChannel
): Promise<void> {
  outputChannel?.appendLine(
    `New workspace folders added (${folders
      .map(f => f.uri.path)
      .join(
        ', '
      )}). Current default formatter is ${config.vscode.editor.defaultFormatter.get()} and suggest setting chromiumide as default is ${
      config.crosFormat.suggestSetAsDefault.get() ? 'enabled' : 'disabled'
    }. Always set as default in CrOS workspace option is ${
      config.crosFormat.alwaysDefaultInCros.get() ? 'enabled' : 'disabled'
    } and we have ${
      config.crosFormat.hasBeenSetAsDefaultInThisWorkspace.get() ? '' : 'not'
    } set it to ${extensionId} at least once.`
  );

  // Exit early if any of the following is true
  //   * chromiumide is already the default formatter,
  //   * user has disabled the suggestion,
  //   * user has enabled the "always set as default in CrOS workspaces" option and it has been set
  //     at least once by the extension.
  if (
    config.vscode.editor.defaultFormatter.get() === extensionId ||
    !config.crosFormat.suggestSetAsDefault.get() ||
    (config.crosFormat.alwaysDefaultInCros.get() &&
      config.crosFormat.hasBeenSetAsDefaultInThisWorkspace.get())
  ) {
    return;
  }

  // If user has enabled the "always set as default in CrOS workspaces" option.
  if (config.crosFormat.alwaysDefaultInCros.get()) {
    if (
      !config.crosFormat.hasBeenSetAsDefaultInThisWorkspace.get() &&
      (await hasCrOSFolder(folders, outputChannel))
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
    (await hasCrOSFolder(folders, outputChannel))
  ) {
    await suggestSettingDefaultFormatterInThisWorkspace(
      extensionId,
      outputChannel
    );
    return;
  }
}

async function suggestSettingDefaultFormatterInThisWorkspace(
  extensionId: string,
  outputChannel?: vscode.OutputChannel
): Promise<void> {
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
    outputChannel?.appendLine(
      `Setting ${extensionId} as default formatter in workspace`
    );
    await config.vscode.editor.defaultFormatter.update(extensionId);
    // Since user said yes to this prompt, they might want to always set the default formatter
    // automatically. Ask if they have not disabled the suggestion.
    if (config.crosFormat.suggestAlwaysDefaultInCros.get()) {
      await suggestSettingDefaultFormatterAlways();
    }
  } else if (choice === CHOICE_NO_WORKPLACE) {
    outputChannel?.appendLine(
      'Do not update default formatter and will not ask again in this workspace'
    );
    // Update workspace setting to not ask again.
    await config.crosFormat.suggestSetAsDefault.update(
      false,
      vscode.ConfigurationTarget.Workspace
    );
  } else if (choice === CHOICE_NEVER) {
    outputChannel?.appendLine(
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

/*
 * Get wildcards listed in a directory's _IGNORE_FILE.
 *
 * Essentially a reimplementation of _get_ignore_wildcards in
 * https://source.corp.google.com/h/chromium/chromiumos/codesearch/+/main:src/repohooks/pre-upload.py?q=_get_ignore_wildcards
 * However, instead of comparing a non-permuted pattern with a truncated (target) file path, add
 * directory prefix to the pattern and compare with the (target's) real path.
 */
async function getIgnoreWildcards(
  directory: string,
  path: string,
  outputChannel?: vscode.OutputChannel
): Promise<string[]> {
  if (!_IGNORED_WILDCARDS_CACHE.has(directory)) {
    const dotfilePath = driver.path.join(directory, _IGNORE_FILE);
    if (await driver.fs.exists(dotfilePath)) {
      outputChannel?.appendLine(`Found ${dotfilePath} applicable to ${path}`);
      _IGNORED_WILDCARDS_CACHE.set(
        directory,
        (await driver.fs.readFile(dotfilePath))
          .split('\n')
          // Ignore empty lines.
          .filter(line => line.length > 0)
          .map(line => line.trim())
          // Ignore comments.
          .filter(line => !line.startsWith('#'))
          // If it is a directory, add * to match everything in it.
          .map(line => (line.endsWith('/') ? line.concat('*') : line))
          // Prepend by directory path so that the pattern is relative to where the .presubmitignore
          // file is.
          .map(line => driver.path.join(directory, line))
      );
    }
  }
  return _IGNORED_WILDCARDS_CACHE.get(directory) ?? [];
}

/*
 * Given a file in a CrOS repo, returns whether it matches a pattern in any .presubmitignore in its
 * ancestor directories up until the repo root directory, and therefore should be ignored.
 *
 * @param path absolute path of the tested file
 * @param crosRoot absolute path of the CrOS checkout the tested file belongs to
 *
 * See the pre-upload script where this function is based on:
 * https://source.corp.google.com/h/chromium/chromiumos/codesearch/+/main:src/repohooks/pre-upload.py?q=_path_is_ignored
 * TODO(b/334700788): update reference when there is proper documentation.
 */
async function pathIsIgnored(
  path: string,
  crosRoot: string,
  outputChannel?: vscode.OutputChannel
): Promise<boolean> {
  // This should not happen if the function is called correctly. See function comment.
  if (!path.startsWith(crosRoot)) {
    throw new Error(
      `Internal error: pathIsIgnored is called with a file path ${path} with non-matching CrOS repo ${crosRoot}.`
    );
  }

  if (driver.path.basename(path) === _IGNORE_FILE) return true;

  let prefix = driver.path.dirname(path);
  while (prefix.startsWith(crosRoot)) {
    for (const wildcard of await getIgnoreWildcards(
      prefix,
      path,
      outputChannel
    )) {
      if (driver.matchGlob(path, wildcard)) {
        outputChannel?.appendLine(
          `Match pattern in ${prefix}/${_IGNORE_FILE}, not formatting ${path}.`
        );
        return true;
      }
    }
    prefix = driver.path.dirname(prefix);
  }
  outputChannel?.appendLine(`${_IGNORE_FILE} not found for ${path}`);
  return false;
}

class CrosFormat implements vscode.DocumentFormattingEditProvider {
  constructor(
    private readonly statusManager: StatusManager,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  async provideDocumentFormattingEdits(
    document: vscode.TextDocument
  ): Promise<vscode.TextEdit[] | undefined> {
    const fsPath = document.uri.fsPath;
    const crosRoot = await driver.cros.findSourceDir(fsPath);
    if (!crosRoot) {
      this.outputChannel.appendLine(
        `Not in CrOS repo; not formatting ${fsPath}.`
      );
      return undefined;
    }
    if (
      await pathIsIgnored(document.uri.fsPath, crosRoot, this.outputChannel)
    ) {
      return undefined;
    }

    this.outputChannel.appendLine(`Formatting ${fsPath}...`);

    const crosExe = crosExeFromCrosRoot(crosRoot);
    const formatterOutput = await commonUtil.exec(
      crosExe,
      ['format', '--stdout', fsPath],
      {
        logger: getUiLogger(),
        ignoreNonZeroExit: true,
      }
    );

    if (formatterOutput instanceof Error) {
      this.outputChannel.appendLine(formatterOutput.message);
      this.statusManager.setStatus(FORMATTER, TaskStatus.ERROR);
      driver.metrics.send({
        category: 'error',
        group: 'format',
        name: 'cros_format_call_error',
        description: 'call to cros format failed',
      });
      return undefined;
    }

    switch (formatterOutput.exitStatus) {
      // 0 means input does not require formatting
      case 0: {
        this.outputChannel.appendLine('no changes needed');
        this.statusManager.setStatus(FORMATTER, TaskStatus.OK);
        return undefined;
      }
      // 1 means input requires formatting
      case 1: {
        this.outputChannel.appendLine('file required formatting');
        this.statusManager.setStatus(FORMATTER, TaskStatus.OK);
        // Depending on how formatting is called it can be interactive
        // (selected from the command palette) or background (format on save).
        driver.metrics.send({
          category: 'background',
          group: 'format',
          name: 'cros_format',
          description: 'cros format',
        });
        const wholeFileRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );
        return [
          vscode.TextEdit.replace(wholeFileRange, formatterOutput.stdout),
        ];
      }
      // 65 means EX_DATA: Syntax errors prevented parsing & formatting.
      case 65: {
        this.outputChannel.appendLine(
          `not formatting file with syntax error: ${formatterOutput.stderr}`
        );
        this.statusManager.setStatus(FORMATTER, TaskStatus.ERROR);
        driver.metrics.send({
          category: 'error',
          group: 'format',
          name: 'cros_format_return_error',
          description: 'cros format returned syntax error',
        });
        return undefined;
      }
      // All other errors, e.g. when the command exits due to a signal and there is no exit status.
      // cros format tool may exit with status code 66 for file not found but it should never occur
      // for our feature since we are passing an opened document.
      default: {
        this.outputChannel.appendLine(formatterOutput.stderr);
        this.statusManager.setStatus(FORMATTER, TaskStatus.ERROR);
        driver.metrics.send({
          category: 'error',
          group: 'format',
          name: 'cros_format_return_error',
          description: 'cros format returned error',
        });
        return undefined;
      }
    }
  }
}

export const TEST_ONLY = {
  CrosFormat,
  pathIsIgnored,
  maybeConfigureOrSuggestSettingDefaultFormatter,
};
