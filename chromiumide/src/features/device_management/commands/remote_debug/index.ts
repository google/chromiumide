// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {DeviceItem} from '../../device_tree_data_provider';
import {CommandContext} from '../common';

/**
 * Starts remote debugging on the device.
 */
export async function remoteDebug(
  _context: CommandContext,
  item: DeviceItem
): Promise<void> {
  await vscode.window.showInformationMessage('remote debug ' + item.hostname);
}
