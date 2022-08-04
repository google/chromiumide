// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as metrics from '../../metrics/metrics';
import {CommandContext, promptNewHostname} from './common';

export async function addDevice(context: CommandContext): Promise<void> {
  metrics.send({
    category: 'interactive',
    group: 'device',
    action: 'add device',
  });

  const hostname = await promptNewHostname(
    'Add New Device',
    context.ownedDeviceRepository
  );
  if (!hostname) {
    return;
  }

  await context.ownedDeviceRepository.addDevice(hostname);
}
