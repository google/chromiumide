// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This is the only file that can call vscode.workspace.getConfiguration().
/* eslint-disable no-restricted-syntax */

import * as vscode from 'vscode';

// Prefixes to be added to all config sections.
// The Go extension, which the user can have, requires a different prefix.
const CROS_IDE_PREFIX = 'cros-ide';
const GO_PREFIX = 'go';

// Wraps vscode API for safer configuration access.
// It ensures that a config entry is always accessed with consistent options,
// such as value type and default value.
class ConfigValue<T> {
  constructor(
    private readonly section: string,
    private readonly prefix = CROS_IDE_PREFIX,
    private readonly configurationTarget = vscode.ConfigurationTarget.Global
  ) {}

  get(): T {
    const value = vscode.workspace
      .getConfiguration(this.prefix)
      .get<T>(this.section);

    if (value === undefined) {
      throw new Error(
        `BUG: ${this.prefix}.${this.section} is not defined in package.json`
      );
    }
    return value;
  }

  async update(value: T | undefined): Promise<void> {
    await vscode.workspace
      .getConfiguration(this.prefix)
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

export const cppCodeCompletion = {
  useHardcodedMapping: new ConfigValue<boolean>(
    'cppCodeCompletion.useHardcodedMapping'
  ),
};

export const underDevelopment = {
  crosFormat: new ConfigValue<boolean>('underDevelopment.crosFormat'),
  deviceManagement: new ConfigValue<boolean>(
    'underDevelopment.deviceManagement'
  ),
  testCoverage: new ConfigValue<boolean>('underDevelopment.testCoverage'),
  gerrit: new ConfigValue<boolean>('underDevelopment.gerrit'),
  runTastTests: new ConfigValue<boolean>('underDevelopment.runTastTests'),
};

export const deviceManagement = {
  devices: new ConfigValue<string[]>('deviceManagement.devices'),
};

export const metrics = {
  collectMetrics: new ConfigValue<boolean>('metrics.collectMetrics'),
  showMessage: new ConfigValue<boolean>('metrics.showMessage'),
};

export const goExtension = {
  toolsGopath: new ConfigValue<string>('toolsGopath', GO_PREFIX),
};

export const TEST_ONLY = {
  CROS_IDE_PREFIX,
};
