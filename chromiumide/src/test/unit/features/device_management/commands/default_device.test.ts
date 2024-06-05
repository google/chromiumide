// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as config from '../../../../../../shared/app/services/config';
import * as abandonedDevices from '../../../../../features/device_management/abandoned_devices';
import {
  setDefaultDevice,
  unsetDefaultDevice,
} from '../../../../../features/device_management/commands/default_device';
import * as crosfleet from '../../../../../features/device_management/crosfleet';
import {
  DeviceAttributes,
  DeviceClient,
} from '../../../../../features/device_management/device_client';
import {DeviceRepository} from '../../../../../features/device_management/device_repository';
import * as provider from '../../../../../features/device_management/device_tree_data_provider';
import {SshIdentity} from '../../../../../features/device_management/ssh_identity';
import {ChromiumosServiceModule} from '../../../../../services/chromiumos';
import * as testing from '../../../../testing';
import * as fakes from '../../../../testing/fakes';

async function getHostnameToContextValuesFromTree(
  treeDataProvider: provider.DeviceTreeDataProvider
): Promise<Map<string, string>> {
  const devices = new Map<string, string>();
  for (const categoryItem of await treeDataProvider.getChildren()) {
    for (const deviceItem of await treeDataProvider.getChildren(categoryItem)) {
      devices.set(deviceItem.label!.toString(), deviceItem.contextValue!);
    }
  }
  return devices;
}

const LSB_RELEASE = `DEVICETYPE=CHROMEBOOK
CHROMEOS_RELEASE_NAME=Chrome OS
CHROMEOS_AUSERVER=https://tools.google.com/service/update2
CHROMEOS_DEVSERVER=
CHROMEOS_ARC_VERSION=8681831
CHROMEOS_ARC_ANDROID_SDK_VERSION=30
CHROMEOS_RELEASE_BUILDER_PATH=board1-release/R1-2.0.0
CHROMEOS_RELEASE_KEYSET=devkeys
CHROMEOS_RELEASE_TRACK=testimage-channel
CHROMEOS_RELEASE_BUILD_TYPE=Official Build
CHROMEOS_RELEASE_DESCRIPTION=2.0.0 (Official Build) dev-channel board1 test
CHROMEOS_RELEASE_BOARD=board1
CHROMEOS_RELEASE_BRANCH_NUMBER=0
CHROMEOS_RELEASE_BUILD_NUMBER=2
CHROMEOS_RELEASE_CHROME_MILESTONE=1
CHROMEOS_RELEASE_PATCH_NUMBER=0
CHROMEOS_RELEASE_VERSION=2.0.0
GOOGLE_RELEASE=2.0.0
CHROMEOS_RELEASE_UNIBUILD=1
`;

describe('device tree view shows correct default device', () => {
  const clock = jasmine.clock();

  const {vscodeEmitters, vscodeSpy} = testing.installVscodeDouble();
  testing.installFakeConfigs(vscodeSpy, vscodeEmitters);

  const fakeExec = testing.installFakeExec();
  const cipdRepository = fakes.installFakeCipd(fakeExec);
  const fakeCrosfleet = fakes.installFakeCrosfleet(fakeExec, cipdRepository);
  fakes.installFakeDepotTools(fakeExec);

  const subscriptions: vscode.Disposable[] = [];

  const state = testing.cleanState(() => {
    const repository = new DeviceRepository(
      new crosfleet.CrosfleetRunner(
        cipdRepository,
        new fakes.VoidOutputChannel(),
        new fakes.VoidOutputChannel()
      ),
      new abandonedDevices.AbandonedDevices(new fakes.Memento())
    );
    const client = new DeviceClient(
      repository,
      new SshIdentity(testing.getExtensionUri(), new ChromiumosServiceModule()),
      vscode.window.createOutputChannel('void'),
      vscode.window.createOutputChannel('void (background)'),
      new Map<string, DeviceAttributes>([
        [
          'hostname-owned',
          {
            board: 'board1',
            builderPath: 'board1-release/R1-2.0.0',
            imageType: 'release',
            chromeosMajorVersion: 2,
            chromeosReleaseVersion: '2.0.0',
          },
        ],
        [
          'hostname-leased',
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
    const treeDataProvider = new provider.DeviceTreeDataProvider(
      repository,
      client
    );
    const reader = new testing.EventReader(
      treeDataProvider.onDidChangeTreeData,
      subscriptions
    );
    return {
      repository,
      client,
      treeDataProvider,
      reader,
    };
  });

  beforeEach(async () => {
    clock.install();
    clock.mockDate(new Date('2000-01-01T00:00:00Z'));
    fakeExec.installStdout(
      'ssh',
      jasmine.arrayContaining([
        jasmine.stringContaining('root@'),
        'cat /etc/lsb-release',
      ]),
      LSB_RELEASE,
      jasmine.anything()
    );

    // Initialize to no default device.
    await config.deviceManagement.default.update('');

    // Add the owned device to repository.
    await state.repository.owned.addDevice('hostname-owned');

    // Add the leased device to repository by setting lease on crosfleet and refresh.
    fakeCrosfleet.setLeases([
      {
        hostname: 'hostname-leased',
        board: 'board1',
        model: 'model1',
        deadline: new Date('2000-01-01T00:03:00Z'),
      },
    ]);
    state.repository.leased.refresh();
  });

  afterEach(() => {
    state.repository.dispose();
    state.client.dispose();
    state.treeDataProvider.dispose();
    vscode.Disposable.from(...subscriptions.splice(0).reverse()).dispose();
    clock.uninstall();
  });

  it('when not set', async () => {
    expect(
      await getHostnameToContextValuesFromTree(state.treeDataProvider)
    ).toEqual(
      new Map([
        ['hostname-owned', 'device-owned'],
        ['hostname-leased', 'device-leased'],
      ])
    );
  });

  it('when set to a non-existing device', async () => {
    await setDefaultDevice('hostname-foo');
    // Wait until tree completed changing.
    await state.reader.read();
    expect(
      await getHostnameToContextValuesFromTree(state.treeDataProvider)
    ).toEqual(
      new Map([
        ['hostname-owned', 'device-owned'],
        ['hostname-leased', 'device-leased'],
      ])
    );
  });

  it('when set to an owned device and unset', async () => {
    await setDefaultDevice('hostname-owned');
    // Wait until tree completed changing.
    await state.reader.read();
    expect(
      await getHostnameToContextValuesFromTree(state.treeDataProvider)
    ).toEqual(
      new Map([
        ['hostname-owned', 'device-owned-default'],
        ['hostname-leased', 'device-leased'],
      ])
    );

    await unsetDefaultDevice();
    // Wait until tree completed changing.
    await state.reader.read();
    expect(
      await getHostnameToContextValuesFromTree(state.treeDataProvider)
    ).toEqual(
      new Map([
        ['hostname-owned', 'device-owned'],
        ['hostname-leased', 'device-leased'],
      ])
    );
  });

  it('when set to a leased device and unset', async () => {
    await setDefaultDevice('hostname-leased');
    // Wait until tree completed changing.
    await state.reader.read();
    expect(
      await getHostnameToContextValuesFromTree(state.treeDataProvider)
    ).toEqual(
      new Map([
        ['hostname-owned', 'device-owned'],
        ['hostname-leased', 'device-leased-default'],
      ])
    );

    await unsetDefaultDevice();
    // Wait until tree completed changing.
    await state.reader.read();
    expect(
      await getHostnameToContextValuesFromTree(state.treeDataProvider)
    ).toEqual(
      new Map([
        ['hostname-owned', 'device-owned'],
        ['hostname-leased', 'device-leased'],
      ])
    );
  });
});
