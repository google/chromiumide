// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../../shared/app/common/common_util';
import * as config from '../../../shared/app/services/config';
import * as repository from './device_repository';
import {SshIdentity} from './ssh_identity';
import * as sshUtil from './ssh_util';

export interface DeviceAttributes {
  board: string;
  builderPath: string | undefined;
  imageType: string;
  chromeosMajorVersion: number;
  chromeosReleaseVersion: string;
}

type DeviceAttributesWithHostname = DeviceAttributes & {
  hostname: string;
};

function equalAttributes(a: DeviceAttributes, b: DeviceAttributes): boolean {
  return (
    a.board === b.board &&
    a.builderPath === b.builderPath &&
    a.imageType === b.imageType &&
    a.chromeosMajorVersion === b.chromeosMajorVersion
  );
}

/**
 * Provides functions to interact with a device with SSH.
 */
export class DeviceClient implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<
    DeviceAttributesWithHostname[]
  >();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private readonly onDidRefreshEmitter = new vscode.EventEmitter<void>();
  readonly onDidRefresh = this.onDidRefreshEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidChangeEmitter,
    this.onDidRefreshEmitter,
  ];

  constructor(
    private readonly deviceRepository: repository.DeviceRepository,
    private readonly sshIdentity: SshIdentity,
    private readonly logger: vscode.OutputChannel,
    private readonly loggerBackground: vscode.OutputChannel,
    private readonly cachedDevicesWithAttributes = new Map<
      string,
      DeviceAttributes
    >()
  ) {
    // Refresh every minute to make sure device attributes are up-to-date, since users might be
    // flashing image on terminal (outside of the IDE).
    const timerId = setInterval(() => {
      void this.refresh(/* hostnames = */ undefined, /* background = */ true);
    }, 60 * 1000);
    this.subscriptions.push(
      config.deviceManagement.devices.onDidChange(() => this.refresh()),
      new vscode.Disposable(() => {
        clearInterval(timerId);
      })
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  async refresh(
    hostnames: string[] | undefined = undefined,
    background = false
  ): Promise<void> {
    const hostnamesToRefresh =
      hostnames ?? (await this.deviceRepository.getHostnames());
    void this.refreshDevicesAttributes(hostnamesToRefresh, background);
  }

  private async refreshDevicesAttributes(
    hostnames: string[],
    background: boolean
  ): Promise<void> {
    const updatedDevicesAttributes: DeviceAttributesWithHostname[] = [];
    await Promise.all(
      hostnames.map(hostname =>
        this.readLsbReleaseFromDevice(hostname, background).then(attributes => {
          if (!(attributes instanceof Error)) {
            const cache = this.cachedDevicesWithAttributes.get(hostname);
            // Do nothing if there is no change to device attributes.
            if (cache && equalAttributes(cache, attributes)) return;

            // Otherwise, update cache and fire event to notify device client etc.
            this.cachedDevicesWithAttributes.set(hostname, attributes);
            updatedDevicesAttributes.push({hostname, ...attributes});
          }
        })
      )
    );
    if (updatedDevicesAttributes.length > 0) {
      this.onDidChangeEmitter.fire(updatedDevicesAttributes);
    }
    this.onDidRefreshEmitter.fire();
  }

  /*
   * Returns device attributes cached from refreshes if available, otherwise connect to device and
   * read the file directly.
   * Note that user may manually flash an image outside of ChromiumIDE (from external terminal) and
   * until the next refresh the value would be stale.
   */
  async getDeviceAttributes(
    hostname: string
  ): Promise<DeviceAttributes | Error> {
    {
      const lsbRelease = this.cachedDevicesWithAttributes?.get(hostname);
      if (lsbRelease) return lsbRelease;
    }
    // Retry once if the device data has not been cached. Update cache and fire event if the retry
    // succeeded.
    const lsbRelease = await this.readLsbReleaseFromDevice(
      hostname,
      /* background = */ false
    );
    if (!(lsbRelease instanceof Error)) {
      this.cachedDevicesWithAttributes.set(hostname, lsbRelease);
      this.onDidChangeEmitter.fire([{hostname, ...lsbRelease}]);
    }
    return lsbRelease;
  }

  private async readLsbReleaseFromDevice(
    hostname: string,
    background: boolean
  ): Promise<DeviceAttributes | Error> {
    const args = sshUtil.buildSshCommand(
      hostname,
      this.sshIdentity,
      [],
      'cat /etc/lsb-release'
    );
    const result = await commonUtil.exec(args[0], args.slice(1), {
      logger: background ? this.loggerBackground : this.logger,
    });
    if (result instanceof Error) {
      return result;
    }
    return parseLsbRelease(result.stdout);
  }
}

function parseLsbRelease(content: string): DeviceAttributes {
  const boardMatch = /CHROMEOS_RELEASE_BOARD=(.*)/.exec(content);
  if (!boardMatch) {
    throw new Error('CHROMEOS_RELEASE_BOARD is missing');
  }
  const board = boardMatch[1];

  // CHROMEOS_RELEASE_BUILDER_PATH can be missing on manually built images.
  const builderPathMatch = /CHROMEOS_RELEASE_BUILDER_PATH=(.*)/.exec(content);
  const builderPath = builderPathMatch ? builderPathMatch[1] : undefined;

  let imageType;
  if (builderPath) {
    const imageTypeMatch = /^.*-(.*)\/.+$/.exec(builderPath);
    if (!imageTypeMatch) {
      throw new Error(
        'Release builder path is not in form <board>-<imageType>/<version>'
      );
    }
    imageType = imageTypeMatch[1];
  } else {
    imageType = 'local';
  }

  // CHROMEOS_RELEASE_VERSION should be present on both prebuilt and manually built images.
  const chromeosReleaseVersionMatch =
    /CHROMEOS_RELEASE_VERSION=((\d+).\d+.\d+)/.exec(content);
  if (!chromeosReleaseVersionMatch) {
    throw new Error(
      `CHROMEOS_RELEASE_VERSION is missing or is not in correct format (XXX-YYYYY.Z.W), content = ${content}`
    );
  }
  const chromeosReleaseVersion = chromeosReleaseVersionMatch[1];
  const chromeosMajorVersion = parseInt(chromeosReleaseVersionMatch[2]);

  return {
    board,
    builderPath,
    imageType,
    chromeosMajorVersion,
    chromeosReleaseVersion,
  };
}

export const TEST_ONLY = {parseLsbRelease};
