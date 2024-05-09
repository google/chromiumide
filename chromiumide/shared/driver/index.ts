// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {ExecOptions, ExecResult} from '../app/common/exec/types';
import {Cros} from './cros';
import {Fs} from './fs';
import {Metrics} from './metrics';
import {Path} from './path';

export enum Platform {
  VSCODE,
  CIDER,
}

export type Driver = Readonly<{
  platform(): Platform;
  cros: Cros;
  fs: Fs;
  path: Path;
  metrics: Metrics;
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
