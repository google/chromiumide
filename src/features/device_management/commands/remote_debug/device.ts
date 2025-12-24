// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {exec} from '../../../../../shared/app/common/common_util';
import {buildSshCommand} from '../../ssh_util';
import {CommandContext, ensureSshSession} from '../common';

/**
 * Manages interaction with the device.
 */
export class Device {
  constructor(
    private readonly context: CommandContext,
    private readonly hostname: string,
    private readonly rootForTesting?: string
  ) {}

  /**
   * Lists executables with debug symbols on the device. If no packages built with debug symbols
   * have been deployed to the device, it will return an empty array.
   */
  async listExecutablesWithDebugSymbols(): Promise<string[] | Error> {
    const prefix = this.rootForTesting ?? '';
    const commandToListExecutablesWithDebugSymbols = [
      // Inspect portage database
      // (https://wiki.gentoo.org/wiki/Handbook:Parts/Portage/Files#Portage_database) to list
      // packages that were built with nostrip feature, and output their CONTENTS filepaths.
      `find ${prefix}/var/db/pkg -name DEBUGBUILD \\( -execdir grep -q '\\bnostrip\\b' FEATURES \\; \\) -printf '%h/CONTENTS\\n'`,
      // Show the contents.
      'xargs cat',
      // List only "obj" files (ignore "sym" and "dir").
      `awk '$1=="obj" {print "${prefix}"$2}'`,
      // Filter executables.
      "xargs -r -I '{}' find '{}' -executable",
      // Filter ELF binaries.
      "scanelf -BF '%F'",
      // Sort by mtime (newer first).
      'xargs -r ls -t',
    ].join(' | ');

    const cmd = buildSshCommand(
      this.hostname,
      this.context.sshIdentity,
      undefined,
      commandToListExecutablesWithDebugSymbols
    );
    const res = await exec(cmd[0], cmd.slice(1), {
      logStdout: true,
    });
    if (res instanceof Error) {
      return res;
    }
    return res.stdout.trim().split('\n');
  }

  async getAttributes(): Promise<{board: string} | Error> {
    return await this.context.deviceClient.getDeviceAttributes(this.hostname);
  }

  async ensureSshSession(): Promise<number | undefined> {
    return await ensureSshSession(this.context, this.hostname);
  }
}
