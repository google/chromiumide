// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {crosExeFromCrosRoot} from '../../common/chromiumos/cros';
import * as commonUtil from '../../common/common_util';
import {getDriver} from '../../common/driver_repository';
import {LruCache} from '../../common/lru_cache';
import {OptionsParser} from '../../common/parse';
import {PresubmitCfg} from '../../common/presubmit_cfg';
import {StatusManager, TaskStatus} from '../../ui/bg_task_status';
import {isPresubmitignored} from './presubmitignore';

const driver = getDriver();

// Task name in the status manager.
export const FORMATTER = 'Formatter';

export class CrosFormatEditProvider
  implements vscode.DocumentFormattingEditProvider
{
  // Maps file path to cros format command.
  private readonly argsCache = new LruCache<string, string[]>(10);

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

  async provideReplace(
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

    let args = this.argsCache.get(fsPath);
    if (!args) {
      const constructedArgs = await this.constructCrosFormatCommand(
        document,
        crosRoot,
        force
      );
      if (constructedArgs instanceof Error) {
        this.output.appendLine(constructedArgs.message);
        this.statusManager.setStatus(FORMATTER, TaskStatus.ERROR);
        driver.metrics.send({
          category: 'error',
          group: 'format',
          name: 'cros_format_parse_presubmit_cfg_error',
          description: 'parsing presubmit.cfg for cros format command failed',
        });
        return;
      }
      if (constructedArgs === undefined) {
        return;
      }
      args = constructedArgs;
      this.argsCache.set(fsPath, args);
    }

    const formatterOutput = await commonUtil.exec(args[0], args.slice(1), {
      logger: this.output,
      ignoreNonZeroExit: true,
      cwd: crosRoot,
    });

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
        this.output.appendLine(
          `exit code ${formatterOutput.exitStatus}: ${formatterOutput.stderr}`
        );
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

  /**
   * Constructs the command that should be executed to format the given file.
   * @param forceFormat overrides rule from PRESUBMIT.cfg or lack thereof and returns the default
   * command that formats the file unconditionally.
   * @returns one of
   *   - the cros format command that should be run; default when forceFormat is true or the one
   *      parsed from the file's git repo's PRESUBMIT.cfg.
   *   - undefined; if PRESUBMIT.cfg does not exist or it does not contain a cros format rule.
   *   - Error on failure to find or parse the PRESUBMIT.cfg.
   */
  private async constructCrosFormatCommand(
    document: vscode.TextDocument,
    crosRoot: string,
    forceFormat: boolean
  ): Promise<string[] | undefined | Error> {
    const crosExe = crosExeFromCrosRoot(crosRoot);
    const defaultCommand = [crosExe, 'format', '--stdout', document.uri.fsPath];

    if (forceFormat) return defaultCommand;

    const cfg = await PresubmitCfg.forDocument(document, crosRoot);
    // Don't format if PRESUBMIT.cfg doesn't exist.
    if (!cfg) return undefined;
    // As of its writing no PRESUBMIT.cfg has more than one cros format entries.
    const command = cfg.crosFormatRunAsHookScript()?.[0];
    // Don't format if PRESUBMIT.cfg instructs not to run cros format.
    if (!command) return undefined;

    const parser = new OptionsParser(command, {
      allowArgs: true,
      allowLongOptions: true,
      allowEqualSeparator: true,
    });
    let args;
    try {
      args = parser.parseOrThrow();
    } catch (e) {
      return new Error(
        `parse cros format commad in PRESUBMIT.cfg for ${document.uri.fsPath}: ${e}`
      );
    }
    // Update args so that the command outputs formatted text.
    args[0] = crosExe; // Replace 'bin/cros' (for chromite) or 'cros'.
    const endOfOptions = args.indexOf('--');
    if (endOfOptions >= 0) args.splice(endOfOptions);
    remove(args, '--check');
    remove(args, '--commit', /.*/);
    remove(args, '${PRESUBMIT_FILES}');

    args.push('--stdout', document.uri.fsPath);

    return args;
  }
}

/** Removes every subslice in `a` that matches `rs`. */
function remove(a: string[], ...rs: (RegExp | string)[]) {
  if (rs.length === 0) return;
  for (let i = 0; i < a.length - rs.length + 1; ) {
    if (
      rs.every((r, j) =>
        r instanceof RegExp ? r.test(a[i + j]) : r === a[i + j]
      )
    ) {
      a.splice(i, rs.length);
      continue;
    }
    i++;
  }
}
