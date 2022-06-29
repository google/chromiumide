// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

// Prefix to be added to all config sections.
const PREFIX = 'cros-ide';

// Wraps vscode API for safer configuration access.
// It ensures that a config entry is always accessed with consistent options,
// such as value type and default value.
class ConfigValue<T> {
  constructor(
    private readonly section: string,
    private readonly configurationTarget = vscode.ConfigurationTarget.Global
  ) {}

  get(): T {
    const value = vscode.workspace
      .getConfiguration(PREFIX)
      .get<T>(this.section);
    if (value === undefined) {
      throw new Error(
        `BUG: ${PREFIX}.${this.section} is not defined in package.json`
      );
    }
    return value;
  }

  async update(value: T | undefined): Promise<void> {
    await vscode.workspace
      .getConfiguration(PREFIX)
      .update(this.section, value, this.configurationTarget);
  }
}

export const board = new ConfigValue<string>('board');

export const boardsAndPackages = {
  showWelcomeMessage: new ConfigValue<boolean>(
    'boardsAndPackages.showWelcomeMessage'
  ),
};

export const codeSearch = {
  // TODO: Consider aligning the setting name.
  instance: new ConfigValue<'public' | 'internal' | 'gitiles'>('codeSearch'),
  // TODO: Consider aligning the setting name.
  openWithRevision: new ConfigValue<boolean>('codeSearchHash'),
};

export const underDevelopment = {
  crosFormat: new ConfigValue<boolean>('underDevelopment.crosFormat'),
  deviceManagement: new ConfigValue<boolean>(
    'underDevelopment.deviceManagement'
  ),
  testCoverage: new ConfigValue<boolean>('underDevelopment.testCoverage'),
};

export const deviceManagement = {
  devices: new ConfigValue<string[]>('deviceManagement.devices'),
};

export const metrics = {
  collectMetrics: new ConfigValue<boolean>('collectMetrics'),
  showMessage: new ConfigValue<boolean>('metrics.showMessage'),
};

export const TEST_ONLY = {
  PREFIX,
};
