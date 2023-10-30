// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import {SshIdentity} from './ssh_identity';
import * as sshUtil from './ssh_util';

export interface LsbRelease {
  board: string;
  builderPath: string | undefined;
}

/**
 * Provides functions to interact with a device with SSH.
 */
export class DeviceClient {
  constructor(
    private readonly hostname: string,
    private readonly sshIdentity: SshIdentity,
    private readonly logger: vscode.OutputChannel
  ) {}

  async readLsbRelease(): Promise<LsbRelease> {
    const args = sshUtil.buildSshCommand(
      this.hostname,
      this.sshIdentity,
      [],
      'cat /etc/lsb-release'
    );
    const result = await commonUtil.exec(args[0], args.slice(1), {
      logger: this.logger,
    });
    if (result instanceof Error) {
      throw result;
    }
    return parseLsbRelease(result.stdout);
  }
}

function parseLsbRelease(content: string): LsbRelease {
  const boardMatch = /CHROMEOS_RELEASE_BOARD=(.*)/.exec(content);
  if (!boardMatch) {
    throw new Error('CHROMEOS_RELEASE_BOARD is missing');
  }
  const board = boardMatch[1];

  // CHROMEOS_RELEASE_BUILDER_PATH can be missing on manually built images.
  const builderPathMatch = /CHROMEOS_RELEASE_BUILDER_PATH=(.*)/.exec(content);
  const builderPath = builderPathMatch ? builderPathMatch[1] : undefined;

  return {board, builderPath};
}
