// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../../../shared/app/common/driver_repository';
import {CommandContext} from './common';

const driver = getDriver();

export async function crosfleetLogin(context: CommandContext): Promise<void> {
  driver.metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_log_in_to_crosfleet',
    description: 'log in to crosfleet',
  });

  const e = await context.crosfleetRunner.login();
  if (e instanceof Error) {
    void vscode.window.showErrorMessage(e.message);
  }
}
