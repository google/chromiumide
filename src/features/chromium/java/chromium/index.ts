// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {execOrThrow} from '../../../../../shared/app/common/common_util';
import {StatusBar} from '../ui';
import {CompilerConfig} from './config';
import {computeCompilerConfigApiV0} from './v0';
import {computeCompilerConfigApiV1} from './v1';

async function getApiVersion(
  srcDir: string,
  output: vscode.OutputChannel,
  token: vscode.CancellationToken
): Promise<number> {
  try {
    const result = await execOrThrow(
      path.join(srcDir, 'build/android/chromiumide_api.py'),
      ['version'],
      {cwd: srcDir, logger: output, cancellationToken: token}
    );
    return Number(result.stdout.trim());
  } catch {
    return 0;
  }
}

/**
 * Computes a CompilerConfig to correctly build Chromium Java files.
 *
 * @param srcDir Path of the top-level "src" directory of a Chromium tree.
 * @param outDir Path of a Chromium build output directory.
 * @param output Output channel for logging.
 * @param token Token to cancel the function execution.
 * @param apiVersion The API version to use to communicate with the Chromium build. It is
 *     auto-detected if not specified.
 * @returns A CompilerConfig that contains information to configure Java
 *     compilers to build Chromium Java code correctly.
 */
export async function computeCompilerConfig(
  srcDir: string,
  outDir: string,
  output: vscode.OutputChannel,
  statusBar: StatusBar,
  token: vscode.CancellationToken,
  apiVersion?: number
): Promise<CompilerConfig> {
  if (apiVersion === undefined) {
    apiVersion = await getApiVersion(srcDir, output, token);
  }
  output.appendLine(`Chromium API endpoint version: ${apiVersion}`);

  if (apiVersion >= 1) {
    return await computeCompilerConfigApiV1(
      srcDir,
      outDir,
      output,
      statusBar,
      token
    );
  }
  return await computeCompilerConfigApiV0(
    srcDir,
    outDir,
    output,
    statusBar,
    token
  );
}
