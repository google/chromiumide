// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Common libs specific to DUT management.
 */
import * as commonUtil from '../../common/common_util';
import * as ideutil from '../../ide_utilities';
import * as dutManager from '../dut_manager';

const BUILDER_PATH_RE = /CHROMEOS_RELEASE_BUILDER_PATH=(.*)/;

export async function crosfleetLeases(): Promise<dutManager.Leases> {
  const out = await commonUtil.exec('crosfleet', ['dut', 'leases', '-json']);
  // TODO: validation...
  return JSON.parse(out) as dutManager.Leases;
}

export async function queryHostVersion(host: string): Promise<string> {
  const output = await ideutil.runSSH(host, ['cat', '/etc/lsb-release']);
  const match = BUILDER_PATH_RE.exec(output);
  if (!match) {
    throw new Error(`Failed to connect to ${host}`);
  }
  return match[1];
}

export async function crosfleetDutAbandon(host: string) {
  await commonUtil.exec('crosfleet', ['dut', 'abandon', host]);
}
