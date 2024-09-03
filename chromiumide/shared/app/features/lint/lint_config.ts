// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ProcessEnv} from '../../common/exec/types';

/** Describes how to run a linter and parse its output. */
export interface LintConfig {
  languageId: string;

  /**
   * Name of this lint config.
   */
  name: string;

  /**
   * Returns the command to run to lint the document. It returns undefined in case linter should not
   * be applied.
   */
  command(
    document: vscode.TextDocument,
    output: vscode.OutputChannel
  ): Promise<LintCommand | undefined>;

  parse(
    stdout: string,
    stderr: string,
    document: vscode.TextDocument
  ): vscode.Diagnostic[];

  // If true, allow empty diagnostics even when linter returned non-zero exit code.
  // Otherwise, such case is raised to an IDE error status.
  ignoreEmptyDiagnostics?: boolean;
}

export interface LintCommand {
  name: string;
  args: string[];
  cwd?: string;
  extraEnv?: ProcessEnv;
}
