// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type {Driver} from '../../driver';

const globalDriver: Driver = {} as Driver;
const registeredDrivers: Driver[] = [];

/**
 * @returns a closure to undo the registration.
 */
export function registerDriver(driver: Driver): () => void {
  Object.setPrototypeOf(globalDriver, driver);
  registeredDrivers.push(driver);

  return () => {
    registeredDrivers.pop();
    const previousDriver = registeredDrivers.length
      ? registeredDrivers[registeredDrivers.length - 1]
      : ({} as Driver);
    Object.setPrototypeOf(globalDriver, previousDriver);
  };
}

export function getDriver(): Driver {
  return globalDriver;
}
