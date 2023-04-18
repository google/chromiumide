// Copyright 2022 The ChromiumOS Authors
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

  /**
   * Returns true if the setting has the same value as the default in package.json.
   */
  hasDefaultValue(): boolean {
    const value = this.get();

    const values = vscode.workspace
      .getConfiguration(this.prefix)
      .inspect<T>(this.section);
    if (values === undefined) {
      throw new Error(
        `Internal error: ${this.prefix}.${this.section} not found (via inspect).`
      );
    }

    return value === values.defaultValue;
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

export const boilerplate = {
  enabled: new ConfigValue<boolean>('boilerplate.enabled'),
  guessNamespace: new ConfigValue<boolean>('boilerplate.guessNamespace'),
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

export const gerrit = {
  enabled: new ConfigValue<boolean>('gerrit.enabled'),
};

export const underDevelopment = {
  chromiumBuild: new ConfigValue<boolean>('underDevelopment.chromiumBuild'),
  crosFormat: new ConfigValue<boolean>('underDevelopment.crosFormat'),
  deviceManagement: new ConfigValue<boolean>(
    'underDevelopment.deviceManagement'
  ),
  deviceManagementV2: new ConfigValue<boolean>(
    'underDevelopment.deviceManagementV2'
  ),
  deviceManagementFlashV2: new ConfigValue<boolean>(
    'underDevelopment.deviceManagementFlashV2'
  ),
  gerrit: new ConfigValue<boolean>('underDevelopment.gerrit'),
  platform2GtestDebugging: new ConfigValue<boolean>(
    'underDevelopment.platform2GtestDebugging'
  ),
  platformEc: new ConfigValue<boolean>('underDevelopment.platformEC'),
  systemLogViewer: new ConfigValue<boolean>('underDevelopment.systemLogViewer'),
  tast: new ConfigValue<boolean>('underDevelopment.tast'),
  testCoverage: new ConfigValue<boolean>('underDevelopment.testCoverage'),
};

export const deviceManagement = {
  devices: new ConfigValue<string[]>('deviceManagement.devices'),
};

export const metrics = {
  collectMetrics: new ConfigValue<boolean>('metrics.collectMetrics'),
  showMessage: new ConfigValue<boolean>('metrics.showMessage'),
};

export const ownersFiles = {
  links: new ConfigValue<boolean>('ownersFiles.links'),
};

export const paths = {
  depotTools: new ConfigValue<string>('paths.depotTools'),
};

export const platformEc = {
  board: new ConfigValue<string>('platformEC.board'),
  mode: new ConfigValue<'RO' | 'RW'>('platformEC.mode'),
  build: new ConfigValue<'Makefile' | 'Zephyr'>('platformEC.build'),
};

// https://github.com/golang/vscode-go/blob/master/docs/settings.md#detailed-list
export const goExtension = {
  gopath: new ConfigValue<string>(
    'gopath',
    GO_PREFIX,
    vscode.ConfigurationTarget.Workspace
  ),
  toolsGopath: new ConfigValue<string>('toolsGopath', GO_PREFIX),
};

export const chrome = {
  ashBuildDir: new ConfigValue<string>('chrome.ashBuildDir'),
  dutName: new ConfigValue<string>('chrome.dutName'),
  outputDirectories: new ConfigValue<boolean>('chrome.outputDirectories'),
};

export const spellchecker = new ConfigValue<boolean>('spellchecker');

export const testCoverage = {
  enabled: new ConfigValue<boolean>('testCoverage.enabled'),
};

export const TEST_ONLY = {
  CROS_IDE_PREFIX,
};
