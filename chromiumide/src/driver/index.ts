// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as os from 'os';
import {ExecOptions, ExecResult} from '../../shared/app/common/exec/types';
import {Event} from '../../shared/app/common/metrics/metrics_event';
import {Driver} from '../../shared/driver';
import {Metrics} from '../features/metrics/metrics';
import {CrosImpl} from './cros';
import {realExec} from './exec';
import {FsImpl} from './fs';
import {PathImpl} from './path';

export class DriverImpl implements Driver {
  async whoami(): Promise<string | Error> {
    return os.userInfo().username;
  }

  readonly cros = new CrosImpl();
  readonly fs = new FsImpl();
  readonly path = new PathImpl();
  exec = (
    name: string,
    args: string[],
    options: ExecOptions = {}
  ): Promise<ExecResult | Error> => realExec(name, args, options);
  async getUserEnvPath(): Promise<string | undefined | Error> {
    return process.env['PATH'];
  }
  sendMetrics(event: Event): void {
    Metrics.send(event);
  }
}
