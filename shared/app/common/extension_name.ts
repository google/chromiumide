// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This is the only file in shared/ that can have hardcoded strings mentioning the extension name.
/* eslint-disable no-restricted-syntax */

import {Platform} from '../../driver';
import {getDriver} from './driver_repository';

const driver = getDriver();

export function extensionName(): string {
  return driver.platform() === Platform.VSCODE ? 'ChromiumIDE' : 'ChromeOS';
}

export function extensionNameLower(): string {
  return driver.platform() === Platform.VSCODE ? 'chromiumide' : 'chromeos';
}
