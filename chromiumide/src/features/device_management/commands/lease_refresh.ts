// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Metrics} from '../../metrics/metrics';
import {CommandContext} from './common';

export async function refreshLeases(context: CommandContext): Promise<void> {
  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_refresh_leases',
    description: 'refresh leases',
  });

  context.deviceRepository.leased.refresh();
}
