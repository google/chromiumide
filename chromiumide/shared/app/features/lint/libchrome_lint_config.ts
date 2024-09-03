// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Platform} from '../../../driver';
import {getDriver} from '../../common/driver_repository';
import {LintCommand, LintConfig} from './lint_config';
import {createDiagnostic, sameFile} from './util';

const driver = getDriver();

export class LibchromeLintConfig implements LintConfig {
  readonly name = 'libchrome check';
  readonly languageId = 'cpp';

  async command(
    document: vscode.TextDocument,
    output: vscode.OutputChannel
  ): Promise<LintCommand | undefined> {
    // For cider ChromeOS extension, libchrome check is not in scope.
    if (driver.platform() === Platform.CIDER) {
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: not applicable on cider`
      );
      return undefined;
    }

    const chromiumosRoot = await driver.cros.findSourceDir(document.fileName);
    if (chromiumosRoot === undefined) {
      output.appendLine(
        `Not applying ${this.name} to ${document.fileName}: CrOS source directory not found`
      );
      return undefined;
    }
    const filepath = document.fileName.slice(chromiumosRoot.length + 1); // To trim / of source dir
    for (const dir of CHECK_LIBCHROME_SRC_DIRS) {
      if (filepath.startsWith(dir)) {
        return {
          name: driver.path.join(chromiumosRoot, CHECK_LIBCHROME_PATH),
          args: [document.fileName],
        };
      }
    }
    return undefined;
  }

  parse(
    stdout: string,
    stderr: string,
    document: vscode.TextDocument
  ): vscode.Diagnostic[] {
    const lineRE =
      /^In File (.+) line ([0-9]+) col ([0-9]+), found .+ \(pattern: .+\), (.+)/gm;
    const diagnostics: vscode.Diagnostic[] = [];
    let match: RegExpExecArray | null;
    while ((match = lineRE.exec(stdout + '\n' + stderr)) !== null) {
      const file = match[1];
      const line = Number(match[2]);
      const startCol = Number(match[3]);
      const message = match[4];
      if (sameFile(document.uri.fsPath, file)) {
        diagnostics.push(
          createDiagnostic(message, 'CrOS libchrome', line, startCol)
        );
      }
    }
    return diagnostics;
  }
}

const CHECK_LIBCHROME_PATH =
  'src/platform/libchrome/libchrome_tools/developer-tools/presubmit/check-libchrome.py';
// List of directories whose files should be run against check-libchrome.py.
const CHECK_LIBCHROME_SRC_DIRS = [
  'src/aosp/packages/modules/Bluetooth/',
  'src/aosp/frameworks/ml/',
  'src/aosp/system/update_engine/',
  'src/partner_private/brother_mlaser/',
  'src/partner_private/fibocom-firmware/',
  'src/partner_private/huddly/',
  'src/platform2/',
  'src/platform/',
  'src/third_party/atrusctl/',
  'src/third_party/virtual_usb_printer/',
];
