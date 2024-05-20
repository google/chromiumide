// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  DeviceClient,
  DeviceAttributes,
  TEST_ONLY,
} from '../../../../../features/device_management/device_client';
import {DeviceCategory} from '../../../../../features/device_management/device_repository';
import {SshIdentity} from '../../../../../features/device_management/ssh_identity';
import {ChromiumosServiceModule} from '../../../../../services/chromiumos';
import * as testing from '../../../../testing';
import {FakeDeviceRepository} from './fake_device_repository';

const LSB_RELEASE_PREBUILT_RELEASE = `DEVICETYPE=CHROMEBOOK
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

const LSB_RELEASE_PREBUILT_SNAPSHOT = `CHROMEOS_RELEASE_APPID={9023C063-08D6-4A4F-908C-BCF97DE8BA69}
CHROMEOS_BOARD_APPID={9023C063-08D6-4A4F-908C-BCF97DE8BA69}
CHROMEOS_CANARY_APPID={90F229CE-83E2-4FAF-8479-E368A34938B1}
DEVICETYPE=CHROMEBOOK
CHROMEOS_RELEASE_NAME=Chromium OS
CHROMEOS_AUSERVER=http://chromeos-ci-ps-us-central1-a-x32-382-ijgz:8080/update
CHROMEOS_DEVSERVER=http://chromeos-ci-ps-us-central1-a-x32-382-ijgz:8080
CHROMEOS_ARC_VERSION=11288992
CHROMEOS_ARC_ANDROID_SDK_VERSION=30
CHROMEOS_RELEASE_BUILDER_PATH=trogdor-snapshot/R122-15739.0.0-93122-8759326004410150929
CHROMEOS_RELEASE_KEYSET=devkeys
CHROMEOS_RELEASE_TRACK=testimage-channel
CHROMEOS_RELEASE_BUILD_TYPE=Test Build - root
CHROMEOS_RELEASE_DESCRIPTION=15739.0.0 (Test Build - root) developer-build trogdor
CHROMEOS_RELEASE_BOARD=trogdor
CHROMEOS_RELEASE_BRANCH_NUMBER=0
CHROMEOS_RELEASE_BUILD_NUMBER=15739
CHROMEOS_RELEASE_CHROME_MILESTONE=122
CHROMEOS_RELEASE_PATCH_NUMBER=0
CHROMEOS_RELEASE_VERSION=15739.0.0
GOOGLE_RELEASE=15739.0.0
CHROMEOS_RELEASE_UNIBUILD=1
`;

const LSB_RELEASE_LOCAL = `CHROMEOS_RELEASE_APPID={9023C063-08D6-4A4F-908C-BCF97DE8BA69}
CHROMEOS_BOARD_APPID={9023C063-08D6-4A4F-908C-BCF97DE8BA69}
CHROMEOS_CANARY_APPID={90F229CE-83E2-4FAF-8479-E368A34938B1}
DEVICETYPE=CHROMEBOOK
CHROMEOS_RELEASE_NAME=Chromium OS
CHROMEOS_AUSERVER=http://hscham1.tok.corp.google.com:8080/update
CHROMEOS_DEVSERVER=http://hscham1.tok.corp.google.com:8080
CHROMEOS_ARC_VERSION=11014719
CHROMEOS_ARC_ANDROID_SDK_VERSION=30
CHROMEOS_RELEASE_KEYSET=devkeys
CHROMEOS_RELEASE_TRACK=testimage-channel
CHROMEOS_RELEASE_BUILD_TYPE=Test Build - root
CHROMEOS_RELEASE_DESCRIPTION=15661.0.0 (Test Build - root) developer-build trogdor
CHROMEOS_RELEASE_BOARD=trogdor
CHROMEOS_RELEASE_BRANCH_NUMBER=0
CHROMEOS_RELEASE_BUILD_NUMBER=15661
CHROMEOS_RELEASE_CHROME_MILESTONE=120
CHROMEOS_RELEASE_PATCH_NUMBER=0
CHROMEOS_RELEASE_VERSION=15661.0.0
GOOGLE_RELEASE=15661.0.0
CHROMEOS_RELEASE_UNIBUILD=1
`;

describe('Device client parses lsb-release', () => {
  const parseLsbRelease = TEST_ONLY.parseLsbRelease;

  it('with prebuilt release image', () => {
    expect(parseLsbRelease(LSB_RELEASE_PREBUILT_RELEASE)).toEqual({
      board: 'hatch',
      builderPath: 'hatch-release/R104-14901.0.0',
      imageType: 'release',
      chromeosMajorVersion: 14901,
      chromeosReleaseVersion: '14901.0.0',
    });
  });

  it('with prebuilt snapshot image', () => {
    expect(parseLsbRelease(LSB_RELEASE_PREBUILT_SNAPSHOT)).toEqual({
      board: 'trogdor',
      builderPath: 'trogdor-snapshot/R122-15739.0.0-93122-8759326004410150929',
      imageType: 'snapshot',
      chromeosMajorVersion: 15739,
      chromeosReleaseVersion: '15739.0.0',
    });
  });

  it('with local image', () => {
    expect(parseLsbRelease(LSB_RELEASE_LOCAL)).toEqual({
      board: 'trogdor',
      builderPath: undefined,
      imageType: 'local',
      chromeosMajorVersion: 15661,
      chromeosReleaseVersion: '15661.0.0',
    });
  });
});

describe('Device client', () => {
  testing.installVscodeDouble();

  const hostname = 'dut1';
  const fakeExec = testing.installFakeExec();

  const subscriptions: vscode.Disposable[] = [];

  beforeEach(async () => {
    jasmine.clock().install();
    fakeExec.installStdout(
      'ssh',
      jasmine.arrayContaining([`root@${hostname}`, 'cat /etc/lsb-release']),
      LSB_RELEASE_PREBUILT_RELEASE,
      jasmine.anything()
    );
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    vscode.Disposable.from(...subscriptions.splice(0)).dispose();
  });

  it('gets device attributes cached', async () => {
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

    const attributes = await client.getDeviceAttributes(hostname);
    expect(attributes).toEqual({
      board: 'board1',
      builderPath: 'board1-release/R1-2.0.0',
      imageType: 'release',
      chromeosMajorVersion: 2,
      chromeosReleaseVersion: '2.0.0',
    });
    expect(await onDidChangeDeviceClientReader.times()).toEqual(0);
  });

  it('gets device attributes uncached', async () => {
    const client = new DeviceClient(
      FakeDeviceRepository.create([
        {
          hostname: hostname,
          category: DeviceCategory.OWNED,
        },
      ]),
      new SshIdentity(testing.getExtensionUri(), new ChromiumosServiceModule()),
      vscode.window.createOutputChannel('void'),
      vscode.window.createOutputChannel('void (background)')
    );

    const onDidChangeDeviceClientReader = new testing.EventReader(
      client.onDidChange
    );
    subscriptions.push(onDidChangeDeviceClientReader);

    const attributes = await client.getDeviceAttributes(hostname);

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
    expect(await onDidChangeDeviceClientReader.times()).toEqual(1);

    expect(attributes).toEqual({
      board: 'hatch',
      builderPath: 'hatch-release/R104-14901.0.0',
      imageType: 'release',
      chromeosMajorVersion: 14901,
      chromeosReleaseVersion: '14901.0.0',
    });

    await client.getDeviceAttributes(hostname);
    expect(await onDidChangeDeviceClientReader.times()).toEqual(1);
  });

  it('gets device attributes not in repository', async () => {
    const client = new DeviceClient(
      FakeDeviceRepository.create([]),
      new SshIdentity(testing.getExtensionUri(), new ChromiumosServiceModule()),
      vscode.window.createOutputChannel('void'),
      vscode.window.createOutputChannel('void (background)')
    );

    const onDidChangeDeviceClientReader = new testing.EventReader(
      client.onDidChange
    );
    subscriptions.push(onDidChangeDeviceClientReader);

    const attributes = await client.getDeviceAttributes(hostname);

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
    expect(await onDidChangeDeviceClientReader.times()).toEqual(1);

    expect(attributes).toEqual({
      board: 'hatch',
      builderPath: 'hatch-release/R104-14901.0.0',
      imageType: 'release',
      chromeosMajorVersion: 14901,
      chromeosReleaseVersion: '14901.0.0',
    });

    await client.getDeviceAttributes(hostname);
    expect(await onDidChangeDeviceClientReader.times()).toEqual(1);
  });

  it('refreshes device metadata every minute', async () => {
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
    const onDidRefreshDeviceClientReader = new testing.EventReader(
      client.onDidRefresh
    );
    subscriptions.push(onDidRefreshDeviceClientReader);

    // Cache is used.
    expect(await client.getDeviceAttributes(hostname)).toEqual({
      board: 'board1',
      builderPath: 'board1-release/R1-2.0.0',
      imageType: 'release',
      chromeosMajorVersion: 2,
      chromeosReleaseVersion: '2.0.0',
    });
    expect(await onDidChangeDeviceClientReader.times()).toEqual(0);

    // After one minute and wait for refresh (by reading the lsb-release on device) to finish.
    jasmine.clock().tick(1 * 60 * 1000);
    const updatedDevicesAttributes = await onDidChangeDeviceClientReader.read();
    expect(await onDidChangeDeviceClientReader.times()).toEqual(1);

    // Check event was fired with updated device attributes.
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

    // Cache have been updated and were used to get device attributes. Does not trigger update.
    expect(await client.getDeviceAttributes(hostname)).toEqual({
      board: 'hatch',
      builderPath: 'hatch-release/R104-14901.0.0',
      imageType: 'release',
      chromeosMajorVersion: 14901,
      chromeosReleaseVersion: '14901.0.0',
    });
    expect(await onDidChangeDeviceClientReader.times()).toEqual(1);

    // Check that the next refresh() call does nothing since attributes have not changed.
    await onDidRefreshDeviceClientReader.read();
    expect(await onDidChangeDeviceClientReader.times()).toEqual(1);
  });

  it('refreshes device metadata the first time', async () => {
    const client = new DeviceClient(
      FakeDeviceRepository.create([
        {
          hostname: hostname,
          category: DeviceCategory.OWNED,
        },
      ]),
      new SshIdentity(testing.getExtensionUri(), new ChromiumosServiceModule()),
      vscode.window.createOutputChannel('void'),
      vscode.window.createOutputChannel('void (background)')
    );

    const onDidChangeDeviceClientReader = new testing.EventReader(
      client.onDidChange
    );
    subscriptions.push(onDidChangeDeviceClientReader);

    // After one minute and wait for refresh (by reading the lsb-release on device) to finish.
    jasmine.clock().tick(1 * 60 * 1000);
    const updatedDevicesAttributes = await onDidChangeDeviceClientReader.read();
    expect(await onDidChangeDeviceClientReader.times()).toEqual(1);

    // Check event was fired with updated device attributes.
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

    // Cache have been updated.
    expect(await client.getDeviceAttributes(hostname)).toEqual({
      board: 'hatch',
      builderPath: 'hatch-release/R104-14901.0.0',
      imageType: 'release',
      chromeosMajorVersion: 14901,
      chromeosReleaseVersion: '14901.0.0',
    });
    expect(await onDidChangeDeviceClientReader.times()).toEqual(1);
  });
});
