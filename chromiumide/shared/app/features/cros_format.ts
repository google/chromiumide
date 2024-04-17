// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import {crosExeFromCrosRoot} from '../common/cros';
import {getDriver} from '../common/driver_repository';
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
    'ChromiumIDE: Formatter'
  );
  statusManager.setTask(FORMATTER, {
    status: TaskStatus.OK,
    outputChannel,
  });

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      [{scheme: 'file'}],
      new CrosFormat(statusManager, outputChannel)
    )
  );
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
    const dotfile_path = driver.path.join(directory, _IGNORE_FILE);
    if (await driver.fs.exists(dotfile_path)) {
      outputChannel?.appendLine(`Found ${dotfile_path} applicable to ${path}`);
      _IGNORED_WILDCARDS_CACHE.set(
        directory,
        (await driver.fs.readFile(dotfile_path))
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
      driver.sendMetrics({
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
        driver.sendMetrics({
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
        driver.sendMetrics({
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
        driver.sendMetrics({
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
};
