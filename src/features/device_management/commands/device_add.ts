// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {getDriver} from '../../../../shared/app/common/driver_repository';
import * as config from '../../../../shared/app/services/config';
import {chromiumos} from '../../../services';
import {checkDeviceImageCompatibilityOrSuggest} from './check_image';
import {ResultDisplayMode} from './check_image/check_image';
import {CommandContext, promptNewHostname} from './common';

const driver = getDriver();

export async function addDevice(
  context: CommandContext,
  chrootService?: chromiumos.ChrootService
): Promise<void> {
  driver.metrics.send({
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

  if (chrootService && config.seamlessDeployment.autoCheck.get()) {
    const checkOutcome = await checkDeviceImageCompatibilityOrSuggest(
      context,
      chrootService,
      hostname,
      ResultDisplayMode.MESSAGE
    );
    // Report on outcome to understand usefulness of the feature.
    driver.metrics.send({
      category: 'interactive',
      group: 'device',
      name: 'device_management_add_device_image_check',
      description: 'image check on adding device',
      outcome: checkOutcome instanceof Error ? 'error' : checkOutcome,
    });
  }
}
