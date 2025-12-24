// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {crosExeFor} from '../../common/chromiumos/cros';
import {getDriver} from '../../common/driver_repository';
import {ProcessEnv} from '../../common/exec/types';
import {OptionsParser} from '../../common/parse';
import {PresubmitCfg} from '../../common/presubmit_cfg';
import {assertNever} from '../../common/typecheck';
import * as config from '../../services/config';
import {LintCommand, LintConfig} from './lint_config';
import {createDiagnostic, parseStaticcheckOutput, sameFile} from './util';

const driver = getDriver();

export class CrosLintConfig implements LintConfig {
  private parseErrorMessageShown = false;

  readonly name = 'cros lint';
  constructor(
    readonly languageId: 'cpp' | 'gn' | 'go' | 'python' | 'shellscript'
  ) {}

  async command(
    document: vscode.TextDocument,
    output: vscode.OutputChannel
  ): Promise<LintCommand | undefined> {
    const crosRoot = await driver.cros.findSourceDir(document.fileName);
    if (crosRoot === undefined) {
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: CrOS source directory not found`
      );
      return;
    }

    if (
      this.languageId === 'go' &&
      !(await driver.cros.findChroot(document.fileName))
    ) {
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: chroot is required to support go linting`
      );
      return;
    }

    const crosExe = await crosExeFor(document.fileName);
    if (!crosExe) {
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: cros exe not found`
      );
      return;
    }

    const presubmitCfg = await PresubmitCfg.forDocument(
      document,
      crosRoot,
      output
    );
    // Don't lint if PRESUBMIT.cfg doesn't exist.
    if (!presubmitCfg) {
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: PRESUBMIT.cfg not found`
      );
      return;
    }

    // Somewhat similar logic to what follows exists in formatting_edit_provider.ts for cros format,
    // but there are subtle differences and as the proverb [1] goes, a little copying is better than
    // a little dependency. [1] https://go-proverbs.github.io/

    // As of its writing no PRESUBMIT.cfg has more than one cros lint entries.
    const rawCommand = presubmitCfg.crosLintRunAsHookScript()?.[0];
    if (!rawCommand) {
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: its PRESUBMIT.cfg does not contain cros lint`
      );
      return; // don't lint
    }

    const parser = new OptionsParser(rawCommand, {
      allowArgs: true,
      allowLongOptions: true,
      allowEqualSeparator: true,
    });
    let command;
    try {
      command = parser.parseOrThrow();
    } catch (e) {
      if (!this.parseErrorMessageShown) {
        this.parseErrorMessageShown = true;
        void vscode.window.showErrorMessage(
          `Failed to parse cros lint command in PRESUBMIT.cfg for ${document.fileName}: ${e}`
        );
      }
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: failed to parse cros lint command in PRESUBMIT.cfg: ${e}`
      );
      return;
    }

    // Update args so that the command lints the file.
    command[0] = crosExe; // Replace 'bin/cros' (for chromite) or 'cros'.
    const endOfOptions = command.indexOf('--');
    if (endOfOptions >= 0) command.splice(endOfOptions);
    remove(command, '--commit', /.*/);
    remove(command, '${PRESUBMIT_FILES}');

    const cwd = this.cwd(crosExe, presubmitCfg.root);

    replaceArg(command, '--exclude', (v: string) => {
      return (
        driver.path.resolve(cwd, v) +
        (v.endsWith(driver.path.sep) ? driver.path.sep : '')
      );
    });
    replaceArg(command, '--include', (v: string) => {
      return driver.path.resolve(cwd, v);
    });

    if (this.languageId === 'shellscript') {
      command.push('--output=parseable');
    }

    command.push(document.fileName);

    return {
      name: command[0],
      args: command.slice(1),
      extraEnv: {...(await this.extraEnv(crosExe))},
    };
  }

  parse(
    stdout: string,
    stderr: string,
    document: vscode.TextDocument
  ): vscode.Diagnostic[] {
    switch (this.languageId) {
      case 'cpp':
        return parseCrosLintCpp(stdout, stderr, document);
      case 'gn':
        return parseCrosLintGn(stdout, stderr, document);
      case 'go':
        return parseCrosLintGo(stdout, stderr, document);
      case 'python':
        return parseCrosLintPython(stdout, stderr, document);
      case 'shellscript':
        return parseCrosLintShell(stdout, stderr, document);
      default:
        assertNever(this.languageId);
    }
  }

  private cwd(crosExe: string, presubmitCfgRoot: string): string {
    switch (this.languageId) {
      case 'gn':
        // gnlint.py needs to be run inside ChromiumOS source tree,
        // otherwise it complains about formatting.
        return driver.path.dirname(crosExe);
      case 'cpp':
      case 'go':
      case 'python':
      case 'shellscript':
        return presubmitCfgRoot;
      default:
        assertNever(this.languageId);
    }
  }

  get ignoreEmptyDiagnostics(): boolean {
    switch (this.languageId) {
      case 'gn':
        // gnlint.py exits with non-zero code when syntax error exists,
        // but not handled here because those overlap with other exetnsions.
        return true;
      case 'python':
        // The linter exits with non-zero code when the file is not auto-formatted.
        return true;
      case 'cpp':
      case 'go':
      case 'shellscript':
        return false;
      default:
        assertNever(this.languageId);
    }
  }

  private async extraEnv(exe: string): Promise<ProcessEnv | undefined> {
    if (this.languageId !== 'go') return;

    // Find staticcheck executable in the chroot because cros lint
    // checks /usr/bin, where the chroot staticcheck is located.
    const chroot = await driver.cros.findChroot(exe);
    if (chroot === undefined) {
      return undefined;
    }
    const goBin = driver.path.join(chroot, '/usr/bin');
    // Add goBin to the PATH so that cros lint can lint go files
    // outside the chroot.
    const pathVar = await driver.getUserEnvPath();
    let newPathVar = `${
      pathVar instanceof Error || pathVar === undefined ? '' : pathVar
    }:${goBin}`;
    // Prepend go.toolsGopath if available
    if (vscode.extensions.getExtension('golang.Go')) {
      const toolsGopathConfig = config.goExtension.toolsGopath.get();
      if (toolsGopathConfig) {
        newPathVar = `${toolsGopathConfig}:${newPathVar}`;
      }
    }

    return {PATH: newPathVar};
  }
}

function parseCrosLintCpp(
  stdout: string,
  stderr: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const lineRE = /^([^ \n]+):([0-9]+): {2}(.*) {2}\[([^ ]+)\] \[([1-5])\]/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  // stdout and stderr are merged, because we saw that warnings can go to
  // either.
  // TODO(b/214322467): Figure out when we should use stderr and when stdout.
  while ((match = lineRE.exec(stdout + '\n' + stderr)) !== null) {
    const file = match[1];
    let line = Number(match[2]);
    // Warning about missing copyright is reported at hard coded line 0.
    // This seems like a bug in cpplint.py, which otherwise uses 1-based
    // line numbers.
    if (line === 0) {
      line = 1;
    }
    const message = match[3];
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(createDiagnostic(message, 'CrOS lint', line));
    }
  }
  return diagnostics;
}

// Parse output from platform2/common-mk/gnlint.py on a GN file.
function parseCrosLintGn(
  stdout: string,
  _stderr: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  // Only the errors that have location in the file are captured.
  // There are two categories of errors without line/column number:
  // - file not formatted by gn-format: should do auto-format upon save
  // - wrong commandline arguments: should be covered by extension unit test
  // So these are ignored.
  const lineRE = /ERROR: ([^ \n:]+):([0-9]+):([0-9]+): (.*)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stdout)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    const startCol = Number(match[3]);
    const message = match[4];
    // Keep the same logic for matching file names,
    // although here it effectively no-op (always BUILD.gn)
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(
        createDiagnostic(message, 'CrOS GN lint', line, startCol)
      );
    }
  }
  return diagnostics;
}

function parseCrosLintGo(
  stdout: string,
  _stderr: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  return parseStaticcheckOutput(stdout, document);
}

// Parse output from cros lint on Python files
function parseCrosLintPython(
  stdout: string,
  _stderr: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const lineRE = /^([^ \n:]+):([0-9]+):([0-9]+): (.*)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stdout)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    // Column number from the python linter is 0-based.
    const startCol = Number(match[3]) + 1;
    const message = match[4];
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(createDiagnostic(message, 'CrOS lint', line, startCol));
    }
  }
  return diagnostics;
}

// Parse output from cros lint --output=parseable on shell files.
function parseCrosLintShell(
  stdout: string,
  stderr: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const lineRE = /^([^ \n:]+):([0-9]+):([0-9]+): (.*)/gm;
  const diagnostics: vscode.Diagnostic[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRE.exec(stdout)) !== null) {
    const file = match[1];
    const line = Number(match[2]);
    const startCol = Number(match[3]);
    const message = match[4];
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(createDiagnostic(message, 'CrOS lint', line, startCol));
    }
  }

  const warningLineRE =
    /[0-9]+:[0-9]+:[0-9]+: WARNING:([^\n:]+):(([0-9]+):)? (.*)/gm;
  while ((match = warningLineRE.exec(stdout)) !== null) {
    const file = match[1];
    const message = match[4];
    let line: number;
    if (match[3]) {
      line = Number(match[3]);
    } else if (
      // See //chromite/lint/linters/whitespace.py
      message === 'delete trailing blank lines' ||
      message === 'file needs a trailing newline'
    ) {
      line = document.lineCount;
    } else {
      line = 1;
    }
    if (sameFile(document.uri.fsPath, file)) {
      diagnostics.push(createDiagnostic(message, 'CrOS lint', line));
    }
  }
  return diagnostics;
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

/** Apply given transform function to all specified args in the command.
 */
function replaceArg(
  command: string[],
  arg: string,
  transform: (v: string) => string
) {
  let i = 0;
  while (i < command.length - 1) {
    if (command[i] === arg) {
      command[i + 1] = transform(command[i + 1]);
      i += 1;
    }
    i += 1;
  }
}
