// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import {getDriver} from '../../common/driver_repository';
import {LintCommand, LintConfig} from './lint_config';
import {parseStaticcheckOutput} from './util';

const driver = getDriver();

export class TastLintConfig implements LintConfig {
  readonly languageId = 'go';

  readonly name = 'tast lint';

  async command(
    document: vscode.TextDocument,
    output: vscode.OutputChannel
  ): Promise<LintCommand | undefined> {
    const linterSubpath = tastLintPath(document.fileName);
    if (!linterSubpath) {
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: not a tast file`
      );
      return;
    }

    if (!(await driver.cros.findChroot(document.fileName))) {
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: chroot is required to support go linting`
      );
      return;
    }

    const goFound = await checkForGo();
    if (!goFound) {
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: go not found`
      );
      return;
    }

    const chromiumosRoot = await driver.cros.findSourceDir(document.fileName);
    if (chromiumosRoot === undefined) {
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: CrOS source directory not found`
      );
      return;
    }

    const name = driver.path.join(chromiumosRoot, linterSubpath);
    const args = [document.fileName];
    const cwd = this.cwd(name);

    return {
      name,
      args,
      cwd,
    };
  }

  parse(
    stdout: string,
    _stderr: string,
    document: vscode.TextDocument
  ): vscode.Diagnostic[] {
    return parseStaticcheckOutput(stdout, document);
  }

  private cwd(exePath: string): string | undefined {
    return driver.path.dirname(driver.path.dirname(exePath));
  }

  // run_lint.sh exits with non-zero status when the file cannot be parsed,
  // which happens often when the code is edited.
  readonly ignoreEmptyDiagnostics = true;
}

const TAST_RE = /^.*\/platform\/(tast-tests-private|tast-tests|tast).*/;

/**
 * Returns the tast linter path relative from chromeos root if and only if the file is under tast,
 * tast-tests, or tast-tests-private directory.
 */
function tastLintPath(path: string): string | undefined {
  const m = TAST_RE.exec(path);
  if (!m) return;
  return `src/platform/${m[1]}/tools/run_lint.sh`;
}

let goWarningShown = false;
async function checkForGo(): Promise<boolean> {
  // Go needs to be installed for tast linter to work.
  const res = await commonUtil.exec('which', ['go']);
  if (!(res instanceof Error)) {
    return true;
  }
  if (goWarningShown) {
    return false;
  }
  goWarningShown = true;
  // Suggest the user install go.
  const choice = await vscode.window.showInformationMessage(
    '*** Linting Tast repos requires the Golang go command. Please install the "go" command (Go language) to a location listed in $PATH.',
    'Troubleshoot'
  );
  if (choice) {
    void vscode.env.openExternal(
      vscode.Uri.parse('http://go/chromiumide-doc-go-not-found')
    );
  }
  return false;
}
