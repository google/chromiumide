// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as dateFns from 'date-fns';
import * as deviceRepository from './device_repository';

export enum ItemKind {
  DEVICE,
  CATEGORY,
  PLACEHOLDER,
  LOGIN,
}

export class DeviceItem extends vscode.TreeItem {
  readonly kind = ItemKind.DEVICE;
  readonly hostname: string;
  readonly iconPath = new vscode.ThemeIcon('device-desktop');

  constructor(device: deviceRepository.Device) {
    super(device.hostname, vscode.TreeItemCollapsibleState.None);
    this.hostname = device.hostname;
  }
}

export class OwnedDeviceItem extends DeviceItem {
  readonly contextValue = 'device-owned';

  constructor(public readonly device: deviceRepository.OwnedDevice) {
    super(device);
  }
}

export class LeasedDeviceItem extends DeviceItem {
  readonly contextValue = 'device-leased';

  constructor(public readonly device: deviceRepository.LeasedDevice) {
    super(device);
    this.description = `${device.board ?? '???'}/${device.model ?? '???'}`;
    if (device.deadline) {
      this.description += ` (until ${dateFns.format(device.deadline, 'p')})`;
    }
  }
}

export class CategoryItem extends vscode.TreeItem {
  readonly kind = ItemKind.CATEGORY;

  constructor(public readonly category: deviceRepository.DeviceCategory) {
    super(
      category === deviceRepository.DeviceCategory.OWNED
        ? 'My Devices'
        : 'Leased Devices',
      vscode.TreeItemCollapsibleState.Expanded
    );
    this.contextValue =
      category === deviceRepository.DeviceCategory.OWNED
        ? 'category-owned'
        : 'category-leased';
  }
}

export class PlaceholderItem extends vscode.TreeItem {
  readonly kind = ItemKind.PLACEHOLDER;

  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
  }
}

export class LoginItem extends vscode.TreeItem {
  readonly kind = ItemKind.LOGIN;
  readonly command: vscode.Command = {
    title: 'Log in to Crosfleet',
    command: 'cros-ide.deviceManagement.crosfleetLogin',
  };

  constructor() {
    super('Click here to log in...', vscode.TreeItemCollapsibleState.None);
  }
}

type Item =
  | OwnedDeviceItem
  | LeasedDeviceItem
  | CategoryItem
  | PlaceholderItem
  | LoginItem;

/**
 * Provides data for the device tree view.
 */
export class DeviceTreeDataProvider
  implements vscode.TreeDataProvider<Item>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    Item | undefined | null | void
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidChangeTreeDataEmitter,
  ];

  constructor(
    private readonly ownedDeviceRepository: deviceRepository.OwnedDeviceRepository,
    private readonly leasedDeviceRepository: deviceRepository.LeasedDeviceRepository
  ) {
    // Subscribe for device repository updates.
    this.subscriptions.push(
      ownedDeviceRepository.onDidChange(() => {
        this.onDidChangeTreeDataEmitter.fire();
      }),
      leasedDeviceRepository.onDidChange(() => {
        this.onDidChangeTreeDataEmitter.fire();
      })
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  async getChildren(parent?: Item): Promise<Item[]> {
    if (parent === undefined) {
      const items = [
        new CategoryItem(deviceRepository.DeviceCategory.OWNED),
        new CategoryItem(deviceRepository.DeviceCategory.LEASED),
      ];
      return items;
    }

    if (parent.kind === ItemKind.CATEGORY) {
      const items: Item[] = [];
      let needLogin = false;
      switch (parent.category) {
        case deviceRepository.DeviceCategory.OWNED:
          items.push(
            ...this.ownedDeviceRepository
              .getDevices()
              .map(d => new OwnedDeviceItem(d))
          );
          break;
        case deviceRepository.DeviceCategory.LEASED:
          if (!(await this.leasedDeviceRepository.checkLogin())) {
            needLogin = true;
          } else {
            items.push(
              ...(await this.leasedDeviceRepository.getDevices()).map(
                d => new LeasedDeviceItem(d)
              )
            );
          }
          break;
      }

      if (needLogin) {
        items.push(new LoginItem());
      } else if (items.length === 0) {
        items.push(
          new PlaceholderItem(
            parent.category === deviceRepository.DeviceCategory.OWNED
              ? 'No device configured yet'
              : 'No leased device'
          )
        );
      }
      return items;
    }
    return [];
  }

  getTreeItem(item: Item): Item {
    return item;
  }
}
