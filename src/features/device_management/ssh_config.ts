// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as dateFns from 'date-fns';
import SSHConfig from 'ssh-config';
import {OwnedDeviceRepository} from './device_repository';

export const defaultConfigPath = path.join(os.homedir(), '.ssh', 'config');

async function readAllHosts(configPath: string): Promise<string[]> {
  let content: string;
  try {
    content = await fs.promises.readFile(configPath, {
      encoding: 'utf-8',
    });
  } catch {
    // Ignore errors on reading the config file.
    return [];
  }

  // We do rough regexp matching to extract hosts from a config.
  // This is not a complete solution (e.g. Include directive is not supported),
  // but covers most cases.
  const hostRegexp = /^\s*Host\s+(.*)$/gim;

  const hosts = [];
  let match: RegExpExecArray | null;
  while ((match = hostRegexp.exec(content)) !== null) {
    if (match === null) {
      break;
    }
    hosts.push(...match[1].split(/\s+/g));
  }
  return hosts;
}

export async function readConfiguredSshHosts(
  configPath: string = defaultConfigPath
): Promise<string[]> {
  const hosts = await readAllHosts(configPath);
  const configuredHosts = hosts.filter(
    host => !host.includes('*') && !host.startsWith('!')
  );
  return [...new Set(configuredHosts)];
}

export async function isLabAccessConfigured(
  configPath: string = defaultConfigPath
): Promise<boolean> {
  const hosts = await readAllHosts(configPath);
  // If lab access is configured, there should be "chromeos*" host.
  return hosts.includes('chromeos*');
}

/**
 * Returns the hosts found in the ssh config file that do not exist in the given device
 * repository.
 */
export async function readUnaddedSshHosts(
  deviceRepository: OwnedDeviceRepository,
  configPath: string = defaultConfigPath
): Promise<string[]> {
  const sshHosts = await readConfiguredSshHosts(configPath);
  const knownHosts = deviceRepository
    .getDevices()
    .map(device => device.hostname);
  const knownHostSet = new Set(knownHosts);
  return sshHosts.filter(hostname => !knownHostSet.has(hostname));
}

/**
 * Removes an ssh config entry by hostname (the Host line), first backing up the file.
 *
 * @throws Error if unable to modify the config.
 */
export async function removeSshConfigEntry(
  hostname: string,
  sshConfigPath: string = defaultConfigPath
): Promise<boolean> {
  let found = false;
  await backupAndModifySshConfig((sshConfig: SSHConfig) => {
    while (sshConfig.remove({Host: hostname})) {
      found = true;
    }
  }, sshConfigPath);
  return found;
}

async function backupAndModifySshConfig(
  modifier: (config: SSHConfig) => void,
  sshConfigPath: string = defaultConfigPath
): Promise<void> {
  const fileContents = fs.readFileSync(sshConfigPath).toString();
  const sshConfig = SSHConfig.parse(fileContents);
  modifier(sshConfig);
  const timestamp = dateFns.format(new Date(), 'yyyy-MMM-dd--HH-mm-ss');
  const backupPath = sshConfigPath + '.cros-ide-bak.' + timestamp;
  fs.copyFileSync(sshConfigPath, backupPath);
  fs.writeFileSync(sshConfigPath, sshConfig.toString());
}
