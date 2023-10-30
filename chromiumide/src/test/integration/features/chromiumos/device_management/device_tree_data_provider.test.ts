// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import * as abandonedDevices from '../../../../../features/device_management/abandoned_devices';
import * as crosfleet from '../../../../../features/device_management/crosfleet';
import * as repository from '../../../../../features/device_management/device_repository';
import * as provider from '../../../../../features/device_management/device_tree_data_provider';
import * as config from '../../../../../services/config';
import * as testing from '../../../../testing';
import * as doubles from '../../../../testing/doubles';
import * as fakes from '../../../../testing/fakes';

interface RenderedTreeNode {
  item: vscode.TreeItem;
  children: RenderedTreeNode[];
}

async function renderTree(
  provider: vscode.TreeDataProvider<unknown>,
  rootElement: unknown = undefined
): Promise<RenderedTreeNode[]> {
  const childElements = await provider.getChildren(rootElement);
  if (!childElements) {
    return [];
  }
  const children = [];
  for (const childElement of childElements) {
    const childItem = await provider.getTreeItem(childElement);
    const grandchildren = await renderTree(provider, childElement);
    children.push({item: childItem, children: grandchildren});
  }
  return children;
}

// Disabled because of flakiness (b/230425191).
xdescribe('Device tree data provider', () => {
  const clock = jasmine.clock();
  beforeEach(() => {
    clock.install();
    clock.mockDate(new Date('2000-01-01T00:00:00Z'));
  });
  afterEach(() => {
    clock.uninstall();
  });

  const {vscodeSpy, vscodeEmitters} = doubles.installVscodeDouble();
  doubles.installFakeConfigs(vscodeSpy, vscodeEmitters);
  const {fakeExec} = testing.installFakeExec();
  const cipdRepository = fakes.installFakeCipd(fakeExec);
  const fakeCrosfleet = fakes.installFakeCrosfleet(fakeExec, cipdRepository);

  const state = testing.cleanState(() => {
    const deviceRepository = new repository.DeviceRepository(
      new crosfleet.CrosfleetRunner(
        cipdRepository,
        new fakes.VoidOutputChannel()
      ),
      new abandonedDevices.AbandonedDevices(new fakes.Memento())
    );
    const deviceTreeDataProvider = new provider.DeviceTreeDataProvider(
      deviceRepository
    );
    return {
      deviceRepository,
      deviceTreeDataProvider,
    };
  });

  afterEach(() => {
    state.deviceTreeDataProvider.dispose();
    state.deviceRepository.dispose();
  });

  it('builds a correct tree', async () => {
    await config.deviceManagement.devices.update([
      'localhost:1111',
      'localhost:2222',
    ]);
    fakeCrosfleet.setLeases([
      {
        hostname: 'cros333',
        board: 'board3',
        model: 'model3',
        deadline: new Date('2000-01-01T00:03:00Z'),
      },
      {
        hostname: 'cros444',
        board: 'board4',
        model: 'model4',
        deadline: new Date('2000-01-01T00:04:00Z'),
      },
    ]);

    const rendered = await renderTree(state.deviceTreeDataProvider);
    expect(rendered).toEqual([
      {
        item: new provider.CategoryItem(repository.DeviceCategory.OWNED),
        children: [
          {
            item: new provider.OwnedDeviceItem({
              category: repository.DeviceCategory.OWNED,
              hostname: 'localhost:1111',
            }),
            children: [],
          },
          {
            item: new provider.OwnedDeviceItem({
              category: repository.DeviceCategory.OWNED,
              hostname: 'localhost:2222',
            }),
            children: [],
          },
        ],
      },
      {
        item: new provider.CategoryItem(repository.DeviceCategory.LEASED),
        children: [
          {
            item: new provider.LeasedDeviceItem({
              category: repository.DeviceCategory.LEASED,
              hostname: 'cros333',
              board: 'board3',
              model: 'model3',
              deadline: new Date('2000-01-01T00:03:00Z'),
            }),
            children: [],
          },
          {
            item: new provider.LeasedDeviceItem({
              category: repository.DeviceCategory.LEASED,
              hostname: 'cros444',
              board: 'board4',
              model: 'model4',
              deadline: new Date('2000-01-01T00:04:00Z'),
            }),
            children: [],
          },
        ],
      },
    ]);
  });

  it('builds a correct tree for initial state', async () => {
    await config.deviceManagement.devices.update([]);
    fakeCrosfleet.setLeases([]);

    const rendered = await renderTree(state.deviceTreeDataProvider);
    expect(rendered).toEqual([
      {
        item: new provider.CategoryItem(repository.DeviceCategory.OWNED),
        children: [
          {
            item: new provider.PlaceholderItem('No device configured yet'),
            children: [],
          },
        ],
      },
      {
        item: new provider.CategoryItem(repository.DeviceCategory.LEASED),
        children: [
          {
            item: new provider.PlaceholderItem('No leased device'),
            children: [],
          },
        ],
      },
    ]);
  });

  it('shows login button if logged out', async () => {
    await config.deviceManagement.devices.update([]);
    fakeCrosfleet.setLeases([]);
    fakeCrosfleet.setLoggedIn(false);

    const rendered = await renderTree(state.deviceTreeDataProvider);
    expect(rendered).toEqual([
      {
        item: new provider.CategoryItem(repository.DeviceCategory.OWNED),
        children: [
          {
            item: new provider.PlaceholderItem('No device configured yet'),
            children: [],
          },
        ],
      },
      {
        item: new provider.CategoryItem(repository.DeviceCategory.LEASED),
        children: [
          {
            item: new provider.LoginItem(),
            children: [],
          },
        ],
      },
    ]);
  });
});

describe('Integration test results', () => {
  xit('are printed successfully (what?)', () => {
    // Without this entry, integration tests end before printing a summary.
    // TODO: Investigate the cause and remove this test.
  });
});
