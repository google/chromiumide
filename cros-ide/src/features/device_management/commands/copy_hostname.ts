// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as metrics from '../../metrics/metrics';
import * as provider from '../device_tree_data_provider';
import {CommandContext} from './common';

export async function copyHostname(
  context: CommandContext,
  item: provider.DeviceItem
): Promise<void> {
  metrics.send({
    category: 'interactive',
    group: 'device',
    action: 'copy hostname',
  });

  await vscode.env.clipboard.writeText(item.hostname);
}
