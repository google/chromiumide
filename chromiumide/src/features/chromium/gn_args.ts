// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import {envForDepotTools} from '../../common/depot_tools';

// This type represents the subset of GN args that we keep track of. Currently, we only keep track
// of the external compile systems (Goma, Siso, Reclient).
export type GnArgs = {
  use_goma: boolean;
  use_siso: boolean;
  use_remoteexec: boolean;
};

export type GnArgsInfo =
  | {type: 'error'; error: string}
  | {type: 'unknown'}
  | {type: 'success'; warnings: string[]; args: GnArgs};

// TODO(cmfcmf): Test whether this also works on Windows.
export async function readGnArgs(
  srcPath: string,
  outputDirectoryName: string,
  token: vscode.CancellationToken
): Promise<GnArgsInfo> {
  const result = await commonUtil.exec(
    'gn',
    [
      'args',
      path.join(srcPath, outputDirectoryName),
      '--list',
      '--short',
      '--overrides-only',
      '--json',
    ],
    {
      cwd: srcPath,
      env: envForDepotTools(),
      cancellationToken: token,
    }
  );
  if (result instanceof Error) {
    if (result instanceof commonUtil.CancelledError) {
      return {
        type: 'error',
        error: result.toString(),
      };
    }
    return {
      type: 'error',
      error:
        result instanceof commonUtil.AbnormalExitError
          ? result.messageWithStdoutAndStderr()
          : result.toString(),
    };
  }

  const warnings: string[] = [];

  // TODO(cmfcmf): It would be nice to validate at runtime that the JSON actually follows this
  // schema.
  let gnArgs: Array<{
    current: {value: string};
    default: {value: string};
    name: string;
  }> | null = null;
  try {
    gnArgs = JSON.parse(result.stdout);
  } catch (error) {
    // Sometimes the command may print additional warnings before the actual JSON output. Retry
    // parsing from the first occurrence of `[`.
  }
  if (gnArgs === null) {
    const arrayStartIdx = result.stdout.indexOf('[');
    if (arrayStartIdx === -1) {
      return {
        type: 'error',
        error: `Unable to parse JSON output: ${result.stdout}`,
      };
    }

    try {
      warnings.push(result.stdout.slice(0, arrayStartIdx).trim());
      gnArgs = JSON.parse(result.stdout.slice(arrayStartIdx));
      if (!Array.isArray(gnArgs)) {
        throw new Error('Expected an array.');
      }
    } catch (error) {
      return {
        type: 'error',
        error: `Unable to parse JSON output (${error}): ${result.stdout}`,
      };
    }
  }

  const args = {
    use_goma:
      gnArgs.find(each => each.name === 'use_goma')?.current.value === 'true',
    use_siso:
      gnArgs.find(each => each.name === 'use_siso')?.current.value === 'true',
    use_remoteexec:
      gnArgs.find(each => each.name === 'use_remoteexec')?.current.value ===
      'true',
  };

  if (!args.use_goma && !args.use_siso && !args.use_remoteexec) {
    warnings.push(
      'Neither Goma, Siso, nor Reclient is enabled. Your builds will compile on your local machine only.'
    );
  }

  return {
    type: 'success',
    warnings,
    args,
  };
}
