// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {crosRoot} from '../../../../../../shared/app/common/common_util';
import {getCrosPath} from '../../../../../common/chromiumos/cros_client';
import {TEST_ONLY} from '../../../../../features/device_management/commands/flash_prebuilt_image';
import {
  DeviceClient,
  DeviceAttributes,
} from '../../../../../features/device_management/device_client';
import {DeviceCategory} from '../../../../../features/device_management/device_repository';
import {SshIdentity} from '../../../../../features/device_management/ssh_identity';
import {ChromiumosServiceModule} from '../../../../../services/chromiumos';
import * as testing from '../../../../testing';
import {VoidOutputChannel} from '../../../../testing/fakes';
import {FakeDeviceRepository} from '../fake_device_repository';

const {flashImageToDevice} = TEST_ONLY;

describe('Flash image to device', () => {
  const {vscodeSpy} = testing.installVscodeDouble();
  const hostname = 'dut1';
  const fakeExec = testing.installFakeExec();
  const tempDir = testing.tempDir();

  const state = testing.cleanState(async () => {
    const {chroot} = await testing.buildFakeChromeos(tempDir.path);
    const chromiumosRoot = crosRoot(chroot);
    return {chromiumosRoot};
  });

  const LSB_RELEASE = `DEVICETYPE=CHROMEBOOK
CHROMEOS_RELEASE_NAME=Chrome OS
CHROMEOS_AUSERVER=https://tools.google.com/service/update2
CHROMEOS_DEVSERVER=
CHROMEOS_ARC_VERSION=8681831
CHROMEOS_ARC_ANDROID_SDK_VERSION=30
CHROMEOS_RELEASE_BUILDER_PATH=hatch-release/R104-14901.0.0
CHROMEOS_RELEASE_KEYSET=devkeys
CHROMEOS_RELEASE_TRACK=testimage-channel
CHROMEOS_RELEASE_BUILD_TYPE=Official Build
CHROMEOS_RELEASE_DESCRIPTION=14901.0.0 (Official Build) dev-channel hatch test
CHROMEOS_RELEASE_BOARD=hatch
CHROMEOS_RELEASE_BRANCH_NUMBER=0
CHROMEOS_RELEASE_BUILD_NUMBER=14901
CHROMEOS_RELEASE_CHROME_MILESTONE=104
CHROMEOS_RELEASE_PATCH_NUMBER=0
CHROMEOS_RELEASE_VERSION=14901.0.0
GOOGLE_RELEASE=14901.0.0
CHROMEOS_RELEASE_UNIBUILD=1
`;

  const subscriptions: vscode.Disposable[] = [];

  beforeEach(async () => {
    jasmine.clock().install();
    fakeExec.installStdout(
      'ssh',
      jasmine.arrayContaining([`root@${hostname}`, 'cat /etc/lsb-release']),
      LSB_RELEASE,
      jasmine.anything()
    );
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    vscode.Disposable.from(...subscriptions.splice(0)).dispose();
  });

  it('fires device client refresh on command successful completion', async () => {
    fakeExec.installStdout(
      getCrosPath(state.chromiumosRoot),
      jasmine.arrayContaining(['flash', `ssh://${hostname}`]),
      '',
      jasmine.anything()
    );

    const client = new DeviceClient(
      FakeDeviceRepository.create([
        {
          hostname: hostname,
          category: DeviceCategory.OWNED,
        },
      ]),
      new SshIdentity(testing.getExtensionUri(), new ChromiumosServiceModule()),
      vscode.window.createOutputChannel('void'),
      vscode.window.createOutputChannel('void (background)'),
      new Map<string, DeviceAttributes>([
        [
          hostname,
          {
            board: 'board1',
            builderPath: 'board1-release/R1-2.0.0',
            imageType: 'release',
            chromeosMajorVersion: 2,
            chromeosReleaseVersion: '2.0.0',
          },
        ],
      ])
    );

    const onDidChangeDeviceClientReader = new testing.EventReader(
      client.onDidChange
    );
    subscriptions.push(onDidChangeDeviceClientReader);

    void flashImageToDevice(
      hostname,
      'hatch-release/R104-14901.0.0',
      client,
      state.chromiumosRoot,
      new VoidOutputChannel()
    );

    // Check event was fired with updated device attributes.
    const updatedDevicesAttributes = await onDidChangeDeviceClientReader.read();
    expect(updatedDevicesAttributes.length).toEqual(1);
    expect(updatedDevicesAttributes).toEqual([
      {
        hostname: hostname,
        board: 'hatch',
        builderPath: 'hatch-release/R104-14901.0.0',
        imageType: 'release',
        chromeosMajorVersion: 14901,
        chromeosReleaseVersion: '14901.0.0',
      },
    ]);
  });

  it('does not fire device client refresh on command failure', async () => {
    fakeExec.installCallback(
      getCrosPath(state.chromiumosRoot),
      jasmine.arrayContaining(['flash', `ssh://${hostname}`]),
      async () => new Error('cros flash failed'),
      jasmine.anything()
    );

    const client = new DeviceClient(
      FakeDeviceRepository.create([
        {
          hostname: hostname,
          category: DeviceCategory.OWNED,
        },
      ]),
      new SshIdentity(testing.getExtensionUri(), new ChromiumosServiceModule()),
      vscode.window.createOutputChannel('void'),
      vscode.window.createOutputChannel('void (background)'),
      new Map<string, DeviceAttributes>([
        [
          hostname,
          {
            board: 'board1',
            builderPath: 'board1-release/R1-2.0.0',
            imageType: 'release',
            chromeosMajorVersion: 2,
            chromeosReleaseVersion: '2.0.0',
          },
        ],
      ])
    );

    const onDidChangeDeviceClientReader = new testing.EventReader(
      client.onDidChange
    );
    subscriptions.push(onDidChangeDeviceClientReader);

    // `cros flash` command will fail.
    await flashImageToDevice(
      hostname,
      'hatch-release/R104-14901.0.0',
      client,
      state.chromiumosRoot,
      new VoidOutputChannel()
    );

    // Check event was not fired.
    expect(onDidChangeDeviceClientReader.times()).toEqual(0);
    expect(vscodeSpy.window.showErrorMessage).toHaveBeenCalledOnceWith(
      jasmine.anything(),
      'Open logs'
    );
  });
});
