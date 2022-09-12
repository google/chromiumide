// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const defaultConfigPath = path.join(os.homedir(), '.ssh', 'config');

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
  return hosts.filter(host => !host.includes('*') && !host.startsWith('!'));
}

export async function isLabAccessConfigured(
  configPath: string = defaultConfigPath
): Promise<boolean> {
  const hosts = await readAllHosts(configPath);
  // If lab access is configured, there should be "chromeos*" host.
  return hosts.includes('chromeos*');
}
