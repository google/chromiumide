// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import {OutputChannel} from 'vscode';
import * as dateFns from 'date-fns';
import {OwnedDeviceRepository} from '../device_repository';
import {buildSshArgs, SshConfigHostEntry} from '../ssh_util';
import {DeviceClient} from './../device_client';
import {DutConnectionConfig, DutNetworkType} from './add_owned_device_model';

// TODO(joelbecker): import normally once tsconfig esModuleInterop=true doesn't break a lot of
// other things.
const SSHConfig = require('ssh-config');

export class AddOwnedDeviceService {
  constructor(
    readonly sshConfigPath: string,
    readonly hostsPath: string,
    readonly testingRsaPath: string,
    private readonly output: OutputChannel,
    private readonly deviceRepository: OwnedDeviceRepository
  ) {}

  /** Adds the given device to the device repository. */
  async addDeviceToRepository(hostname: string): Promise<void> {
    await this.deviceRepository.addDevice(hostname);
  }

  /**
   * Tries to connect to the device via the configured connection, throwing on failure.
   *
   * @throws Error if unable to connect.
   */
  async tryToConnect(config: DutConnectionConfig): Promise<void> {
    const client = new DeviceClient(
      this.output,
      buildSshArgs(
        config.hostname,
        config.forwardedPort ?? undefined,
        this.sshConfigHostTemplate(config)
      )
    );
    await client.readLsbRelease();
  }

  /**
   * Adds an ssh config entry for the given DUT connection configuration.
   *
   * @throws Error if unable to modify the config.
   */
  addHostToSshConfig(config: DutConnectionConfig): void {
    this.modifySshConfig(sshConfig => {
      sshConfig.prepend(this.sshConfigHostTemplate(config));
    });
  }

  private modifySshConfig(modifier: (config: typeof SSHConfig) => void): void {
    const fileContents = fs.readFileSync(this.sshConfigPath).toString();
    const sshConfig = SSHConfig.parse(fileContents);
    modifier(sshConfig);
    const timestamp = dateFns.format(new Date(), 'yyyy-MMM-dd--HH-mm-ss');
    const backupPath = this.sshConfigPath + '.cros-ide-bak.' + timestamp;
    fs.copyFileSync(this.sshConfigPath, backupPath);
    fs.writeFileSync(this.sshConfigPath, sshConfig.toString());
  }

  // TODO(joelbecker): Get from user configuration.
  private sshConfigHostTemplate(
    config: DutConnectionConfig
  ): SshConfigHostEntry {
    if (config.networkType === DutNetworkType.OFFICE) {
      return {
        Host: config.hostname,
        Hostname:
          config.networkType === DutNetworkType.OFFICE
            ? config.ipAddress
            : '127.0.0.1',
        Port:
          config.networkType === DutNetworkType.OFFICE
            ? 22
            : config.forwardedPort ?? undefined,
        CheckHostIP: 'no',
        ControlMaster: 'auto',
        ControlPath: '/tmp/ssh-%r%h%p',
        ControlPersist: '3600',
        IdentitiesOnly: 'yes',
        IdentityFile: this.testingRsaPath,
        StrictHostKeyChecking: 'no',
        User: 'root',
        UserKnownHostsFile: '/dev/null',
        VerifyHostKeyDNS: 'no',
        ProxyCommand: 'corp-ssh-helper -dest4 %h %p', // corp-ssh-helper is installed by default on gLinux and gMac
        // HostKeyAlias
      };
    } else {
      return {
        Host: config.hostname,
        Hostname: '127.0.0.1',
        Port: config.forwardedPort ?? undefined,
        User: 'root',
        IdentitiesOnly: 'yes',
        IdentityFile: '%d/.ssh/testing_rsa',
        StrictHostKeyChecking: 'no',
      };
    }
  }
}
