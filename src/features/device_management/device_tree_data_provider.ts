// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as dateFns from 'date-fns';
import * as client from './device_client';
import * as repository from './device_repository';

export enum ItemKind {
  ATTRIBUTE,
  DEVICE,
  CATEGORY,
  PLACEHOLDER,
  LOGIN,
}

export type DeviceAttributeKey =
  | 'board'
  | 'model'
  | 'CrOS release version'
  | 'builder path';

export class DeviceAttributeItem extends vscode.TreeItem {
  readonly kind = ItemKind.ATTRIBUTE;
  override readonly contextValue: string;
  readonly value: string;

  constructor(key: DeviceAttributeKey, value: string) {
    super(value);
    this.description = `(${key})`;
    this.value = value;
    this.contextValue = key;
  }
}

export class DeviceItem extends vscode.TreeItem {
  readonly kind = ItemKind.DEVICE;
  readonly hostname: string;
  override readonly iconPath: vscode.ThemeIcon;

  constructor(readonly device: repository.Device, isDefault: boolean) {
    // Expand by default to show device attributes of the default device only to avoid cluttering.
    super(
      device.hostname,
      isDefault
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    );
    this.hostname = device.hostname;
    this.iconPath = new vscode.ThemeIcon(
      // 'vm-active' is the same as 'device-desktop' with a tick. There is no equivalent icon with
      // the desktop prefix.
      isDefault ? 'vm-active' : 'device-desktop'
    );
    this.description = isDefault ? 'default' : '';
  }
}

export class OwnedDeviceItem extends DeviceItem {
  override readonly contextValue;

  constructor(
    override readonly device: repository.OwnedDevice,
    isDefault = false
  ) {
    super(device, isDefault);
    this.contextValue = isDefault ? 'device-owned-default' : 'device-owned';
  }
}

export class LeasedDeviceItem extends DeviceItem {
  override readonly contextValue;

  constructor(
    override readonly device: repository.LeasedDevice,
    isDefault = false
  ) {
    super(device, isDefault);
    const now = new Date();
    if (device.deadline) {
      const distance = dateFns.differenceInMinutes(device.deadline, now);
      this.description = `${this.description} (${distance}m remaining)`;
    }
    this.contextValue = isDefault ? 'device-leased-default' : 'device-leased';
  }
}

export class CategoryItem extends vscode.TreeItem {
  readonly kind = ItemKind.CATEGORY;

  constructor(readonly category: repository.DeviceCategory) {
    super(
      category === repository.DeviceCategory.OWNED
        ? 'My Devices'
        : 'Leased Devices',
      vscode.TreeItemCollapsibleState.Expanded
    );
    this.contextValue =
      category === repository.DeviceCategory.OWNED
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
  override readonly command: vscode.Command = {
    title: 'Log in to Crosfleet',
    command: 'chromiumide.deviceManagement.crosfleetLogin',
  };

  constructor() {
    super('Click here to log in...', vscode.TreeItemCollapsibleState.None);
  }
}

type Item =
  | DeviceAttributeItem
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
    private readonly deviceRepository: repository.DeviceRepository,
    private readonly deviceClient: client.DeviceClient
  ) {
    // Subscribe for device repository updates.
    this.subscriptions.push(
      deviceRepository.onDidChange(() => {
        this.onDidChangeTreeDataEmitter.fire();
      }),
      deviceClient.onDidChange(() => {
        this.onDidChangeTreeDataEmitter.fire();
      })
    );

    // Loading every time for displaying remaining leased time
    const timerId = setInterval(() => {
      this.onDidChangeTreeDataEmitter.fire();
    }, 60000);

    this.subscriptions.push(
      new vscode.Disposable(() => {
        clearInterval(timerId);
      })
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  async getChildren(parent?: Item): Promise<Item[]> {
    if (parent === undefined) {
      const items = [
        new CategoryItem(repository.DeviceCategory.OWNED),
        new CategoryItem(repository.DeviceCategory.LEASED),
      ];
      return items;
    }

    if (parent.kind === ItemKind.CATEGORY) {
      const items: Item[] = [];
      let needLogin = false;
      switch (parent.category) {
        case repository.DeviceCategory.OWNED:
          items.push(
            ...this.deviceRepository.owned
              .getDevices()
              .map(d => new OwnedDeviceItem(d, repository.isDefaultDevice(d)))
          );
          break;
        case repository.DeviceCategory.LEASED:
          if (!(await this.deviceRepository.leased.checkLogin())) {
            needLogin = true;
          } else {
            items.push(
              ...(await this.deviceRepository.leased.getDevices()).map(
                d => new LeasedDeviceItem(d, repository.isDefaultDevice(d))
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
            parent.category === repository.DeviceCategory.OWNED
              ? 'No device configured yet'
              : 'No leased device'
          )
        );
      }
      return items;
    }

    if (parent.kind === ItemKind.DEVICE) {
      const items: Item[] = [];
      const attributes = await this.deviceClient.getDeviceAttributes(
        parent.hostname
      );
      if (attributes instanceof Error) return [];

      items.push(new DeviceAttributeItem('board', attributes.board));

      if (parent instanceof LeasedDeviceItem && parent.device.model) {
        items.push(new DeviceAttributeItem('model', parent.device.model));
      }
      if (attributes.chromeosReleaseVersion) {
        items.push(
          new DeviceAttributeItem(
            'CrOS release version',
            attributes.chromeosReleaseVersion
          )
        );
      }
      if (attributes.builderPath) {
        items.push(
          new DeviceAttributeItem('builder path', attributes.builderPath)
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
