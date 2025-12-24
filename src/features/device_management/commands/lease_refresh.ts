// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {getDriver} from '../../../../shared/app/common/driver_repository';
import {CommandContext} from './common';

const driver = getDriver();

export async function refreshLeases(context: CommandContext): Promise<void> {
  driver.metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_refresh_leases',
    description: 'refresh leases',
  });

  context.deviceRepository.leased.refresh();
}
