// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {ChrootService} from '../../../../services/chromiumos/chroot';
import {DeviceItem} from '../../device_tree_data_provider';
import {CommandContext} from '../common';
import {Device} from './device';
import {GdbShimServerStarter} from './gdb_shim_server';
import {RemoteDebug} from './remote_debug';

/**
 * Starts debugging a process on the device.
 */
export async function remoteDebug(
  context: CommandContext,
  item: DeviceItem,
  chrootService?: ChrootService
): Promise<void> {
  if (!chrootService) {
    throw new Error('TODO(b/227137453): handle missing chroot error');
  }

  const device = new Device(context, item.hostname);
  const gdbShimServerFactory = new GdbShimServerStarter(chrootService);
  await new RemoteDebug(device, gdbShimServerFactory).run();
}
