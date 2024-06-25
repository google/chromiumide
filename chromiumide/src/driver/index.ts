// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import minimatch from 'minimatch';
import {ExecOptions, ExecResult} from '../../shared/app/common/exec/types';
import {Driver, Platform} from '../../shared/driver';
import {CrosImpl} from './cros';
import {realExec} from './exec';
import {FsImpl} from './fs';
import {MetricsImpl} from './metrics/metrics';
import {OsImpl} from './os';
import {PathImpl} from './path';

export class DriverImpl implements Driver {
  platform(): Platform {
    return Platform.VSCODE;
  }

  readonly cros = new CrosImpl();
  readonly fs = new FsImpl();
  readonly os = new OsImpl();
  readonly path = new PathImpl();
  readonly metrics = new MetricsImpl();
  exec = (
    name: string,
    args: string[],
    options: ExecOptions = {}
  ): Promise<ExecResult | Error> => realExec(name, args, options);
  async getUserEnvPath(): Promise<string | undefined | Error> {
    return process.env['PATH'];
  }
  matchGlob(path: string, pattern: string): boolean {
    return minimatch(path, pattern);
  }

  async findGitDir(filePath: string, root = '/'): Promise<string | undefined> {
    if (!filePath.startsWith(root)) {
      throw new Error(
        `internal error: findGitDir: ${filePath} must be under ${root}`
      );
    }

    let dir: string;
    if (!(await this.fs.exists(filePath))) {
      // tests use files that do not exist
      dir = this.path.dirname(filePath);
    } else if (await this.fs.isDirectory(filePath)) {
      dir = filePath;
    } else {
      dir = this.path.dirname(filePath);
    }

    while (dir !== root) {
      if (await this.fs.exists(this.path.join(dir, '.git'))) {
        return dir;
      }
      dir = this.path.dirname(dir);
    }

    return undefined;
  }
  // Not implemented since the implementation does not have local dependency (only implemented for
  // cider).
  activateFeedback(): void {}
}
