// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import * as crosfleet from '../../../../features/device_management/crosfleet';
import * as repository from '../../../../features/device_management/device_repository';
import * as provider from '../../../../features/device_management/device_tree_data_provider';
import * as config from '../../../../services/config';
import * as testing from '../../../testing';
import * as fakes from '../../../testing/fakes';

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

describe('Device tree data provider', () => {
  const {fakeExec} = testing.installFakeExec();
  const cipdRepository = fakes.installFakeCipd(fakeExec);

  const state = testing.cleanState(() => {
    const ownedDeviceRepository = new repository.OwnedDeviceRepository();
    const leasedDeviceRepository = new repository.LeasedDeviceRepository(
      new crosfleet.CrosfleetRunner(
        cipdRepository,
        new fakes.VoidOutputChannel()
      )
    );
    const deviceTreeDataProvider = new provider.DeviceTreeDataProvider(
      ownedDeviceRepository,
      leasedDeviceRepository
    );
    return {
      ownedDeviceRepository,
      leasedDeviceRepository,
      deviceTreeDataProvider,
    };
  });

  afterEach(() => {
    state.deviceTreeDataProvider.dispose();
    state.ownedDeviceRepository.dispose();
    state.leasedDeviceRepository.dispose();
  });

  it('builds a correct tree', async () => {
    await config.deviceManagement.devices.update([
      'localhost:1111',
      'localhost:2222',
    ]);
    const rendered = await renderTree(state.deviceTreeDataProvider);
    expect(rendered).toEqual([
      {
        item: new provider.CategoryItem(repository.DeviceCategory.OWNED),
        children: [
          {
            item: new provider.DeviceItem(
              'localhost:1111',
              repository.DeviceCategory.OWNED
            ),
            children: [],
          },
          {
            item: new provider.DeviceItem(
              'localhost:2222',
              repository.DeviceCategory.OWNED
            ),
            children: [],
          },
        ],
      },
    ]);
  });

  it('builds a correct tree for initial state', async () => {
    await config.deviceManagement.devices.update([]);
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
    ]);
  });
});

describe('Integration test results', () => {
  xit('are printed successfully (what?)', () => {
    // Without this entry, integration tests end before printing a summary.
    // TODO: Investigate the cause and remove this test.
  });
});
