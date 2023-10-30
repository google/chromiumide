// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Metrics} from '../../metrics/metrics';
import {CommandContext, promptNewHostname} from './common';

export async function addDevice(context: CommandContext): Promise<void> {
  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_add_device',
    description: 'add device',
  });

  const hostname = await promptNewHostname(
    'Add New Device',
    context.deviceRepository.owned
  );
  if (!hostname) {
    return;
  }
  await context.deviceRepository.owned.addDevice(hostname);
}
