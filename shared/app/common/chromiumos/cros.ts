// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {getDriver} from '../driver_repository';

export const driver = getDriver();
export const CROS_PATH = 'chromite/bin/cros';

export function crosExeFromCrosRoot(crosRoot: string): string {
  return driver.path.join(crosRoot, CROS_PATH);
}

export async function crosExeFor(path: string): Promise<string | undefined> {
  const chromiumosRoot = await driver.cros.findSourceDir(path);
  if (chromiumosRoot === undefined) return undefined;
  return driver.path.join(chromiumosRoot, CROS_PATH);
}
