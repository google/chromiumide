// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as mockFs from 'mock-fs';
import 'jasmine';
import * as sshConfig from '../../../../../features/device_management/ssh_config';
import {SshConfigHostEntry} from '../../../../../features/device_management/ssh_util';
import {FakeDeviceRepository} from './fake_device_repository';

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

const CONFIG_PATH = '/test/.ssh/config';

describe('SSH config parser', () => {
  beforeEach(() => {
    mockFs({
      [CONFIG_PATH]: TEST_CONFIG_FILE,
    });
  });

  afterEach(() => {
    mockFs.restore();
  });

  describe('readConfiguredSshHosts', () => {
    it('can parse simple configs', async () => {
      const result = await sshConfig.readConfiguredSshHosts(CONFIG_PATH);
      expect(result).toEqual(['dut1', 'dut2', 'dut3', 'dut4']);
    });

    it("doesn't return duplicate host names", async () => {
      mockFs({
        [CONFIG_PATH]: `
        Host dut1 dut2 dut3
        Host dut2 dut3
        Host dut3
        `,
      });

      const result = await sshConfig.readConfiguredSshHosts(CONFIG_PATH);
      expect(result).toEqual(['dut1', 'dut2', 'dut3']);
    });
  });

  describe('isLabAccessConfigured', () => {
    it('can check if lab access is configured', async () => {
      await fs.promises.writeFile(CONFIG_PATH, 'Host chromeos*');
      expect(await sshConfig.isLabAccessConfigured(CONFIG_PATH)).toBeTrue();

      await fs.promises.writeFile(CONFIG_PATH, 'Host android*');
      expect(await sshConfig.isLabAccessConfigured(CONFIG_PATH)).toBeFalse();
    });
  });

  describe('readUnaddedSshHosts', () => {
    it('returns hosts from the config that do not exist in the repository', async () => {
      const deviceRepository = new FakeDeviceRepository([
        {hostname: 'dut2'},
        {hostname: 'dut4'},
      ]);

      const result = await sshConfig.readUnaddedSshHosts(
        deviceRepository,
        CONFIG_PATH
      );

      expect(result).toEqual(['dut1', 'dut3']);
    });
  });

  describe('modifying functions', () => {
    const hostname = 'host1';
    const configContentsWithoutHost1 = `
    Host preexisting-entry
      Hostname 127.0.0.1
      Port 4242
    `;
    const configContentsWithHost1 = `Host ${hostname}
      Hostname 1.2.3.4


    Host preexisting-entry
      Hostname 127.0.0.1
      Port 4242
    `;
    const entry: SshConfigHostEntry = {
      Host: hostname,
      Hostname: '1.2.3.4',
    };
    const startingTime = new Date(2022, 0, 2, 3, 4, 5);
    const backupFilename = 'config.cros-ide-bak.2022-Jan-02--03-04-05';

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date(startingTime));
    });

    afterEach(() => {
      jasmine.clock().uninstall();
      mockFs.restore();
    });

    it('backs up the .ssh config and adds the new entry, preserving previous entries', async () => {
      mockFs({
        '/test/.ssh/config': configContentsWithoutHost1,
      });
      await sshConfig.addSshConfigEntry(entry, '/test/.ssh/config');

      const files = await fs.promises.readdir('/test/.ssh');
      expect(files).toEqual(['config', backupFilename]);
      const backupContents = fs
        .readFileSync(`/test/.ssh/${backupFilename}`)
        .toString();
      const newContents = fs.readFileSync('/test/.ssh/config').toString();
      expect(newContents).toBe(configContentsWithHost1);
      expect(backupContents).toBe(configContentsWithoutHost1);
    });

    it('backs up the .ssh config and removes the entry for the given host', async () => {
      mockFs({
        '/test/.ssh/config': configContentsWithHost1,
      });
      await sshConfig.removeSshConfigEntry(hostname, '/test/.ssh/config');

      const files = await fs.promises.readdir('/test/.ssh');
      expect(files).toEqual(['config', backupFilename]);
      const backupContents = fs
        .readFileSync(`/test/.ssh/${backupFilename}`)
        .toString();
      const newContents = fs.readFileSync('/test/.ssh/config').toString();
      expect(newContents.trim()).toBe(configContentsWithoutHost1.trim());
      expect(backupContents.trim()).toBe(configContentsWithHost1.trim());
    });

    it('Removes all Host entries for the given host name, unless there are also other host names in the entry', async () => {
      mockFs({
        '/test/.ssh/config': `
        Host host1 host2 host3
          Hostname 1.2.3.4

        Host host2 host1
          Hostname 1.2.3.4

        Host host1
          Hostname 1.2.3.4

        Host host1
          Hostname 4.3.2.1

        Host preexisting-entry
          Hostname 127.0.0.1
          Port 4242
        `,
      });
      await sshConfig.removeSshConfigEntry(hostname, '/test/.ssh/config');

      const newContents = fs.readFileSync('/test/.ssh/config').toString();
      expect(newContents.trim()).toBe(
        `
        Host host1 host2 host3
          Hostname 1.2.3.4

        Host host2 host1
          Hostname 1.2.3.4

        Host preexisting-entry
          Hostname 127.0.0.1
          Port 4242
      `.trim()
      );
    });
  });
});
