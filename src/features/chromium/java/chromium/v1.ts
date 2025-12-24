// Copyright 2025 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {execOrThrow} from '../../../../../shared/app/common/common_util';
import {extraEnvForDepotTools} from '../../../../../shared/app/common/depot_tools';
import {StatusBar} from '../ui';
import {CompilerConfig} from './config';

/**
 * Schema of chromiumide_api.py build-info output.
 */
interface BuildInfoResponse {
  classPaths: string[];
  sourcePaths: string[];
}

export async function computeCompilerConfigApiV1(
  srcDir: string,
  outDir: string,
  output: vscode.OutputChannel,
  statusBar: StatusBar,
  token: vscode.CancellationToken
): Promise<CompilerConfig> {
  return await statusBar.withProgress(
    'Building Java configurations...',
    async () => {
      const extraEnv = await extraEnvForDepotTools();
      const result = await execOrThrow(
        path.join(srcDir, 'build/android/chromiumide_api.py'),
        ['build-info', '--output-dir=' + outDir],
        {cwd: srcDir, extraEnv, logger: output, cancellationToken: token}
      );
      const buildInfo = JSON.parse(result.stdout) as BuildInfoResponse;
      return {
        sourcePaths: buildInfo.sourcePaths.map(p => path.resolve(srcDir, p)),
        classPaths: buildInfo.classPaths.map(p => path.resolve(srcDir, p)),
      };
    }
  );
}
