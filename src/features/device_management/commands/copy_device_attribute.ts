// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../../../shared/app/common/driver_repository';
import * as provider from '../device_tree_data_provider';
import {CommandContext} from './common';

const driver = getDriver();

export async function copyHostname(
  context: CommandContext,
  item: provider.DeviceItem
): Promise<void> {
  driver.metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_copy_hostname',
    description: 'copy hostname',
  });

  await vscode.env.clipboard.writeText(item.hostname);
}

export async function copyAttribute(
  context: CommandContext,
  item: provider.DeviceAttributeItem
): Promise<void> {
  driver.metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_copy_device_attribute',
    description: 'copy device attribute',
    attribute: item.contextValue,
  });

  await vscode.env.clipboard.writeText(item.value);
}
