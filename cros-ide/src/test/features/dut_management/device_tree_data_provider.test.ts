// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import * as repository from '../../../features/dut_management/device_repository';
import * as provider from '../../../features/dut_management/device_tree_data_provider';
import * as testing from '../../testing';
import * as repositoryUtil from './device_repository_util';

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
  const state = testing.cleanState(() => {
    const staticDeviceRepository = new repository.StaticDeviceRepository();
    const leasedDeviceRepository = new repository.LeasedDeviceRepository();
    const deviceTreeDataProvider = new provider.DeviceTreeDataProvider(
      staticDeviceRepository,
      leasedDeviceRepository
    );
    return {
      staticDeviceRepository,
      leasedDeviceRepository,
      deviceTreeDataProvider,
    };
  });

  afterEach(() => {
    state.deviceTreeDataProvider.dispose();
    state.staticDeviceRepository.dispose();
    state.leasedDeviceRepository.dispose();
  });

  it('builds a correct tree', async () => {
    await repositoryUtil.setStaticHosts(['localhost:1111', 'localhost:2222']);
    const rendered = await renderTree(state.deviceTreeDataProvider);
    expect(rendered).toEqual([
      {
        item: new provider.CategoryItem(repository.DeviceCategory.STATIC),
        children: [
          {
            item: new provider.DeviceItem(
              'localhost:1111',
              repository.DeviceCategory.STATIC
            ),
            children: [],
          },
          {
            item: new provider.DeviceItem(
              'localhost:2222',
              repository.DeviceCategory.STATIC
            ),
            children: [],
          },
        ],
      },
    ]);
  });

  it('builds a correct tree for initial state', async () => {
    await repositoryUtil.setStaticHosts([]);
    const rendered = await renderTree(state.deviceTreeDataProvider);
    expect(rendered).toEqual([
      {
        item: new provider.CategoryItem(repository.DeviceCategory.STATIC),
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
