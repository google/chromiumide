// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ExecOptions, ExecResult} from '../app/common/exec/types';
import {Cros} from './cros';
import {Fs} from './fs';
import {Metrics} from './metrics';
import {Os} from './os';
import {Path} from './path';

export enum Platform {
  VSCODE,
  CIDER,
}

export type Driver = Readonly<{
  platform(): Platform;
  cros: Cros;
  fs: Fs;
  os: Os;
  path: Path;
  metrics: Metrics;
  /**
   * Finds the root directory of the Git repository containing the filePath,
   * which can be a regular file or a directory.
   * @param root directory where the search should end at (exclusive, root can not be the git root
   * directory). Default is root '/'.
   * @returns undefined if the file is not under a Git repository.
   */
  findGitDir(filePath: string, root?: string): Promise<string | undefined>;
  exec: (
    name: string,
    args: string[],
    options?: ExecOptions
  ) => Promise<ExecResult | Error>;
  getUserEnvPath(): Promise<string | undefined | Error>;
  matchGlob: (path: string, pattern: string) => boolean;
  // Only implemented on cider where implementation has local dependency.
  activateFeedback(context: vscode.ExtensionContext): void;
}>;
