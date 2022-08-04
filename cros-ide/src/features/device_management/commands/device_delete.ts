// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as metrics from '../../metrics/metrics';
import * as provider from '../device_tree_data_provider';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

export async function deleteDevice(
  context: CommandContext,
  item?: provider.DeviceItem
): Promise<void> {
  metrics.send({
    category: 'interactive',
    group: 'device',
    action: 'delete device',
  });

  const hostname = await promptKnownHostnameIfNeeded(
    'Delete Device',
    item,
    context.ownedDeviceRepository,
    context.leasedDeviceRepository
  );
  if (!hostname) {
    return;
  }

  await context.ownedDeviceRepository.removeDevice(hostname);
}
