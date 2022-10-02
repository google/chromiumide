// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import {OutputChannel} from 'vscode';
import {DeviceComm} from '../device_comm';
import {OwnedDeviceRepository} from '../device_repository';
import {DutConnectionConfig} from './add_owned_device_model';

// TODO(joelbecker): import normally once tsconfig esModuleInterop=true doesn't break a lot of
// other things.
const SSHConfig = require('ssh-config');

/**
 * Service layer for the Add Owned Device feature (used by the controller/panel to perform the
 * actual backend work with system resources).
 */
export class AddOwnedDeviceService {
  constructor(
    readonly sshConfigPath: string,
    readonly hostsPath: string,
    private readonly output: OutputChannel,
    private readonly deviceRepository: OwnedDeviceRepository
  ) {}

  /**
   * Runs the connection test step, applying other optional operations such as updating the SSH
   * config file. If the connection fails, an error is thrown, and changes are rolled back.
   *
   * TODO(joelbecker): Apply SSH config changes after connection succeeds, once we do not rely on it
   * for connection.
   *
   * @return string device info if connection is successful.
   * @throws Error if unable to connect, or unable to update the SSH config file.
   */
  public async configureAndTestConnection(
    config: DutConnectionConfig
  ): Promise<string> {
    if (config.addToSshConfig) {
      this.addHostToSshConfig(config);
    }
    try {
      const info = await this.tryToConnect(config);

      if (config.addToHostsFile) {
        // TODO(joelbecker): this.addToHostsFile(config); // but with execSudo() or the like
      }

      await this.deviceRepository.addDevice(config.hostname);

      return info;
    } catch (e) {
      this.output.appendLine(JSON.stringify(e));
      try {
        this.removeHostFromSshConfig(config.hostname);
      } catch (e2) {
        this.output.appendLine(JSON.stringify(e2));
        // TODO: log unable to rollback ssh config change
      }
      throw e;
    }
  }

  private sshConfigHostTemplate(config: DutConnectionConfig): any {
    if (config.location === 'office') {
      return {
        Host: config.hostname,
        Hostname: config.location === 'office' ? config.ipAddress : '127.0.0.1',
        Port: config.location === 'office' ? 22 : config.forwardedPort,
        CheckHostIP: 'no',
        ControlMaster: 'auto',
        ControlPath: '/tmp/ssh-%r%h%p',
        ControlPersist: '3600',
        IdentitiesOnly: 'yes',
        IdentityFile: '%d/.ssh/testing_rsa', // TODO(joelbecker): get path centrally, verify exists
        StrictHostKeyChecking: 'no',
        User: 'root',
        UserKnownHostsFile: '/dev/null',
        VerifyHostKeyDNS: 'no',
        ProxyCommand: 'corp-ssh-helper -dest4 %h %p',
      };
    } else {
      return {
        Host: config.hostname,
        Hostname: '127.0.0.1',
        Port: config.forwardedPort,
        User: 'root',
        IdentitiesOnly: 'yes',
        IdentityFile: '%d/.ssh/testing_rsa',
        StrictHostKeyChecking: 'no',
      };
    }
  }

  private async tryToConnect(config: DutConnectionConfig): Promise<string> {
    const comm = new DeviceComm(config.hostname, config.forwardedPort);
    return await comm.readLsbRelease();
  }

  private addHostToSshConfig(config: DutConnectionConfig): void {
    this.modifySshConfig(sshConfig => {
      sshConfig.prepend(this.sshConfigHostTemplate(config));
    });
  }

  private removeHostFromSshConfig(hostname: string): void {
    this.modifySshConfig((sshConfig: typeof SSHConfig) => {
      sshConfig.remove({Host: hostname});
    });
  }

  private modifySshConfig(modifier: (config: typeof SSHConfig) => void): void {
    const fileContents = fs.readFileSync(this.sshConfigPath).toString();
    const sshConfig = SSHConfig.parse(fileContents);
    modifier(sshConfig);
    // TODO(joelbecker): backup carefully. Manage sequence of .bak.1 .bak.2 etc.
    fs.copyFileSync(this.sshConfigPath, this.sshConfigPath + '.bak');
    fs.writeFileSync(this.sshConfigPath, sshConfig.toString());
  }
}
