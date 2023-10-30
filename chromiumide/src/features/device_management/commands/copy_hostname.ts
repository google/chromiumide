// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Metrics} from '../../metrics/metrics';
import * as provider from '../device_tree_data_provider';
import {CommandContext} from './common';

export async function copyHostname(
  context: CommandContext,
  item: provider.DeviceItem
): Promise<void> {
  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_copy_hostname',
    description: 'copy hostname',
  });

  await vscode.env.clipboard.writeText(item.hostname);
}
