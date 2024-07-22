// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {CommandContext} from '../../../../features/device_management/commands/common';
import {remoteDebug} from '../../../../features/device_management/commands/remote_debug';
import {DeviceItem} from '../../../../features/device_management/device_tree_data_provider';
import {installVscodeDouble} from '../../../testing';

describe('Remote debug', () => {
  const {vscodeSpy} = installVscodeDouble();

  it('works', async () => {
    const hostname = 'brya';
    await remoteDebug({} as CommandContext, {hostname} as DeviceItem);

    expect(vscodeSpy.window.showInformationMessage).toHaveBeenCalled();
  });
});
