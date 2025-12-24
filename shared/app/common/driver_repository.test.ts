// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {Platform, type Driver} from '../../driver';
import {getDriver, registerDriver} from './driver_repository';

describe('registerDriver', () => {
  it('works for object', async () => {
    const driver = getDriver();

    const undo = registerDriver({
      platform: () => Platform.CIDER,
    } as Driver);

    try {
      expect(await driver.platform()).toEqual(Platform.CIDER);
    } finally {
      undo();
    }
  });

  it('works for class instance', async () => {
    const driver = getDriver();

    class DriverImpl {
      platform() {
        return Platform.CIDER;
      }
    }
    const undo = registerDriver(new DriverImpl() as Driver);

    try {
      expect(await driver.platform()).toEqual(Platform.CIDER);
    } finally {
      undo();
    }
  });
});
