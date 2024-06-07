// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {crosExeFromCrosRoot} from '../../common/chromiumos/cros';
import * as commonUtil from '../../common/common_util';
import {getDriver} from '../../common/driver_repository';
import {StatusManager, TaskStatus} from '../../ui/bg_task_status';
import {getUiLogger} from '../../ui/log';
import {isPresubmitignored} from './presubmitignore';

const driver = getDriver();

// Task name in the status manager.
export const FORMATTER = 'Formatter';

export class CrosFormatEditProvider
  implements vscode.DocumentFormattingEditProvider
{
  constructor(
    private readonly statusManager: StatusManager,
    private readonly output: vscode.OutputChannel
  ) {}

  async provideDocumentFormattingEdits(
    document: vscode.TextDocument
  ): Promise<vscode.TextEdit[] | undefined> {
    const replace = await this.provideReplace(document, {force: false});
    if (!replace) return;

    return [vscode.TextEdit.replace(replace.location, replace.value)];
  }

  async forceFormat(editor: vscode.TextEditor): Promise<void> {
    const replace = await this.provideReplace(editor.document, {force: true});
    if (!replace) return;

    await editor.edit(edit => {
      edit.replace(replace.location, replace.value);
    });
  }

  private async provideReplace(
    document: vscode.TextDocument,
    {force}: {force: boolean}
  ): Promise<
    | {
        location: vscode.Range;
        value: string;
      }
    | undefined
  > {
    const fsPath = document.uri.fsPath;
    const crosRoot = await driver.cros.findSourceDir(fsPath);
    if (!crosRoot) {
      this.output.appendLine(`Not in CrOS repo; not formatting ${fsPath}.`);
      return;
    }

    if (!force && (await isPresubmitignored(fsPath, crosRoot, this.output))) {
      this.output.appendLine(`${fsPath} is .presubmitignore-d`);
      return;
    }

    this.output.appendLine(
      `${force ? 'Force formatting' : 'Formatting'} ${fsPath}...`
    );

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
      this.output.appendLine(formatterOutput.message);
      this.statusManager.setStatus(FORMATTER, TaskStatus.ERROR);
      driver.metrics.send({
        category: 'error',
        group: 'format',
        name: 'cros_format_call_error',
        description: 'call to cros format failed',
      });
      return;
    }

    switch (formatterOutput.exitStatus) {
      // 0 means input does not require formatting
      case 0: {
        this.output.appendLine('no changes needed');
        this.statusManager.setStatus(FORMATTER, TaskStatus.OK);
        return;
      }
      // 1 means input requires formatting
      case 1: {
        this.output.appendLine('file required formatting');
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
        return {
          location: wholeFileRange,
          value: formatterOutput.stdout,
        };
      }
      // 65 means EX_DATA: Syntax errors prevented parsing & formatting.
      case 65: {
        this.output.appendLine(
          `not formatting file with syntax error: ${formatterOutput.stderr}`
        );
        this.statusManager.setStatus(FORMATTER, TaskStatus.ERROR);
        driver.metrics.send({
          category: 'error',
          group: 'format',
          name: 'cros_format_return_error',
          description: 'cros format returned syntax error',
        });
        return;
      }
      // All other errors, e.g. when the command exits due to a signal and there is no exit status.
      // cros format tool may exit with status code 66 for file not found but it should never occur
      // for our feature since we are passing an opened document.
      default: {
        this.output.appendLine(formatterOutput.stderr);
        this.statusManager.setStatus(FORMATTER, TaskStatus.ERROR);
        driver.metrics.send({
          category: 'error',
          group: 'format',
          name: 'cros_format_return_error',
          description: 'cros format returned error',
        });
        return;
      }
    }
  }
}
