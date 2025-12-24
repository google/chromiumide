// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../shared/app/common/common_util';
import {extraEnvForDepotTools} from '../../../shared/app/common/depot_tools';
import {
  AbnormalExitError,
  CancelledError,
} from '../../../shared/app/common/exec/types';

export type TargetOs =
  | 'linux'
  | 'win'
  | 'mac'
  | 'android'
  | 'ios'
  | 'chromeos'
  | 'fuchsia'
  | null;

// This type represents the subset of GN args that we keep track of. Currently, we only keep track
// of the external compile systems (Goma, Siso, Reclient) and the computed target OS.
export type GnArgs = {
  useGoma: boolean;
  useSiso: boolean;
  useRemoteexec: boolean;
  // This parameter is computed based on the `target_os` and `host_os` GN args, as well as the
  // actual OS of the user's machine if neither `target_os` nor `host_os` are set.
  computedTargetOs: TargetOs;
};

export type GnArgsInfo =
  | {type: 'error'; error: string}
  | {type: 'unknown'}
  | {type: 'success'; warnings: string[]; args: GnArgs};

type GnArgsJson = Array<{
  current: {
    // This is a JSON-encoded string
    value: string;
  };
  default: {
    // This is a JSON-encoded string
    value: string;
  };
  name: string;
}>;

export async function readGnArgs(
  srcPath: string,
  outputDirectoryName: string,
  token: vscode.CancellationToken
): Promise<GnArgsInfo> {
  const isWindows = os.platform() === 'win32';

  const gnArgsCommandArgs = [
    'args',
    path.join(srcPath, outputDirectoryName),
    '--list',
    '--short',
    '--json',
  ];

  let commandName: string;
  let commandArgs: string[];
  if (isWindows) {
    // On Windows, execute gn.bat via cmd.exe /c to ensure shell processing
    commandName = 'cmd.exe';
    // Pass gn.bat and its arguments to cmd.exe using /c
    commandArgs = ['/c', 'gn.bat', ...gnArgsCommandArgs];
  } else {
    // On other platforms, execute gn directly
    commandName = 'gn';
    commandArgs = gnArgsCommandArgs;
  }

  const result = await commonUtil.exec(commandName, commandArgs, {
    cwd: srcPath,
    extraEnv: await extraEnvForDepotTools(),
    cancellationToken: token,
  });
  if (result instanceof Error) {
    if (result instanceof CancelledError) {
      return {
        type: 'error',
        error: result.toString(),
      };
    }
    return {
      type: 'error',
      error:
        result instanceof AbnormalExitError
          ? result.messageWithStdoutAndStderr()
          : result.toString(),
    };
  }

  const warnings: string[] = [];

  // TODO(cmfcmf): It would be nice to validate at runtime that the JSON actually follows this
  // schema.
  let gnArgs: GnArgsJson | null = null;
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
    useGoma: getValue(gnArgs, 'use_goma') === true,
    useSiso: getValue(gnArgs, 'use_siso') === true,
    useRemoteexec: getValue(gnArgs, 'use_remoteexec') === true,
    computedTargetOs: computeTargetOsFromArgs(
      getValue(gnArgs, 'target_os'),
      getValue(gnArgs, 'host_os')
    ),
  };

  if (!args.useGoma && !args.useSiso && !args.useRemoteexec) {
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

function getValue(args: GnArgsJson, name: string): unknown {
  const arg = args.find(each => each.name === name);
  return JSON.parse(arg?.current?.value ?? arg?.default?.value ?? 'null');
}

function computeTargetOsFromArgs(targetOS: unknown, hostOS: unknown): TargetOs {
  switch (targetOS) {
    case null:
    case '':
      if (hostOS) {
        return computeTargetOsFromArgs(hostOS, null);
      }
      // Sometimes neither `host_os` nor `target_os` are set. In this case, GN will use the host's
      // OS.
      return getTargetOsFromHost();
    case 'linux':
      return 'linux';
    case 'android':
      return 'android';
    case 'win':
      return 'win';
    case 'ios':
      return 'ios';
    case 'mac':
      return 'mac';
    case 'fuchsia':
      return 'fuchsia';
    case 'chromeos':
      return 'chromeos';
    default:
      return null;
  }
}

function getTargetOsFromHost(): TargetOs {
  switch (os.platform()) {
    case 'win32':
    case 'cygwin':
      return 'win';
    case 'darwin':
      return 'mac';
    case 'linux':
    case 'freebsd':
    case 'netbsd':
    case 'openbsd':
      return 'linux';
    default:
      return null;
  }
}

export const TEST_ONLY = {
  getTargetOsFromHost,
};
