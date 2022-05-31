// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import 'jasmine';
import * as path from 'path';
import * as sshConfig from '../../../../features/device_management/ssh_config';
import * as testing from '../../../testing';

const TEST_CONFIG_FILE = `
# Comments are ignored
Host dut1
Host *
Host *.cros
Host !*.exclude
Host dut2 dut3 dut*
HOST dut4
# Host dutX
`;

describe('SSH config parser', () => {
  const tempDir = testing.tempDir();

  it('can parse simple configs', async () => {
    const configPath = path.join(tempDir.path, 'ssh_config');
    await fs.promises.writeFile(configPath, TEST_CONFIG_FILE);
    expect(await sshConfig.readConfiguredSshHosts(configPath)).toEqual([
      'dut1',
      'dut2',
      'dut3',
      'dut4',
    ]);
  });
});
