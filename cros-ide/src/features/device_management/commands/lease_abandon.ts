// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Metrics} from '../../metrics/metrics';
import * as provider from '../device_tree_data_provider';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

export async function abandonLease(
  context: CommandContext,
  item?: provider.DeviceItem
): Promise<void> {
  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_abandon_lease',
    description: 'abandon lease',
  });

  const hostname = await promptKnownHostnameIfNeeded(
    'Device to Abandon',
    item,
    context.deviceRepository.leased
  );
  if (!hostname) {
    return;
  }

  const YES = 'Yes, abandon the device';
  const choice = await vscode.window.showQuickPick([YES, 'No'], {
    title: `Do you want to cancel the lease of ${hostname}?`,
  });
  if (choice !== YES) {
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
        title: `Abandoning ${hostname}...`,
      },
      async (_progress, token) => {
        // Register DUT as abandoned first, so it disappears for sure.
        await context.abandonedDevices.insert(hostname);
        await context.crosfleetRunner.abandonLease(hostname, token);
      }
    );
  } catch (e) {
    void vscode.window.showErrorMessage(`Failed to abandon a lease: ${e}`);
  }
}
