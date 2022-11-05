// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../common/common_util';
import {parseMultilineKeyEqualsValue} from '../../../common/output_parsing';
import {ExecResult} from './../../../common/common_util';

export type LsbRelease = {
  readonly chromeosArcAndroidSdkVersion: string;
  readonly chromeosArcVersion: string;
  readonly chromeosAuserver: string;
  readonly chromeosBoardAppid: string;
  readonly chromeosCanaryAppid: string;
  readonly chromeosDevserver: string;
  readonly chromeosReleaseAppid: string;
  readonly chromeosReleaseBoard: string;
  readonly chromeosReleaseBranchNumber: string;
  readonly chromeosReleaseBuilderPath?: string; // can be missing on manually built images.
  readonly chromeosReleaseBuildNumber?: string;
  readonly chromeosReleaseBuildType: string;
  readonly chromeosReleaseChromeMilestone: string;
  readonly chromeosReleaseDescription: string;
  readonly chromeosReleaseKeyset: string;
  readonly chromeosReleaseName: string;
  readonly chromeosReleasePatchNumber: string;
  readonly chromeosReleaseTrack: string;
  readonly chromeosReleaseUnibuild: string;
  readonly chromeosReleaseVersion: string;
  readonly devicetype: string;
  readonly googleRelease: string;
};

function parseLsbRelease(content: string): LsbRelease {
  const record = parseMultilineKeyEqualsValue(content);
  return {
    chromeosArcAndroidSdkVersion: record.CHROMEOS_ARC_ANDROID_SDK_VERSION ?? '',
    chromeosArcVersion: record.CHROMEOS_ARC_VERSION ?? '',
    chromeosAuserver: record.CHROMEOS_AUSERVER ?? '',
    chromeosBoardAppid: record.CHROMEOS_BOARD_APPID ?? '',
    chromeosCanaryAppid: record.CHROMEOS_CANARY_APPID ?? '',
    chromeosDevserver: record.CHROMEOS_DEVSERVER ?? '',
    chromeosReleaseAppid: record.CHROMEOS_RELEASE_APPID ?? '',
    chromeosReleaseBoard: record.CHROMEOS_RELEASE_BOARD ?? '',
    chromeosReleaseBranchNumber: record.CHROMEOS_RELEASE_BRANCH_NUMBER ?? '',
    chromeosReleaseBuilderPath: record.CHROMEOS_RELEASE_BUILDER_PATH ?? '',
    chromeosReleaseBuildNumber: record.CHROMEOS_RELEASE_BUILD_NUMBER ?? '',
    chromeosReleaseBuildType: record.CHROMEOS_RELEASE_BUILD_TYPE ?? '',
    chromeosReleaseChromeMilestone:
      record.CHROMEOS_RELEASE_CHROME_MILESTONE ?? '',
    chromeosReleaseDescription: record.CHROMEOS_RELEASE_DESCRIPTION ?? '',
    chromeosReleaseKeyset: record.CHROMEOS_RELEASE_KEYSET ?? '',
    chromeosReleaseName: record.CHROMEOS_RELEASE_NAME ?? '',
    chromeosReleasePatchNumber: record.CHROMEOS_RELEASE_PATCH_NUMBER ?? '',
    chromeosReleaseTrack: record.CHROMEOS_RELEASE_TRACK ?? '',
    chromeosReleaseUnibuild: record.CHROMEOS_RELEASE_UNIBUILD ?? '',
    chromeosReleaseVersion: record.CHROMEOS_RELEASE_VERSION ?? '',
    devicetype: record.DEVICETYPE ?? '',
    googleRelease: record.GOOGLE_RELEASE ?? '',
  };
}

/**
 * Provides functions to interact with a device with SSH.
 */
export class DeviceClient {
  /**
   * @param outputChannel Where to log command execution.
   * @param sshArgs Args to pass onto the ssh command. You'll probably want to build these using one
   *  of the ssh_util functions.
   */
  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    private readonly sshArgs: Array<string>
  ) {}

  /**
   * @returns The contents of the lsb-release file.
   * @throws Error if the contents cannot be successfully read.
   */
  async readLsbRelease(): Promise<LsbRelease> {
    const result = await this.runCommand('cat /etc/lsb-release');
    return parseLsbRelease(result.stdout);
  }

  /**
   * Runs the given command on the device (via SSH).
   *
   * @throws Error if the command is not successfully run.
   */
  async runCommand(cmd: string): Promise<ExecResult> {
    const result = await commonUtil.exec('ssh', [...this.sshArgs, cmd], {
      logger: this.outputChannel,
    });
    if (result instanceof Error) {
      throw result;
    } else {
      return result;
    }
  }
}
