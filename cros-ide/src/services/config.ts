// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This is the only file that can call vscode.workspace.getConfiguration().
/* eslint-disable no-restricted-syntax */

import * as vscode from 'vscode';

// Prefixes to be added to all config sections.
// The Go extension, which the user can have, requires a different prefix.
const CROS_IDE_PREFIX = 'cros-ide';
const CHROMIUMIDE_PREFIX = 'chromiumide';
const GO_PREFIX = 'go';

// Wraps vscode API for safer configuration access.
// It ensures that a config entry is always accessed with consistent options,
// such as value type and default value.
class ConfigValue<T> {
  constructor(
    private readonly section: string,
    private readonly prefix: string,
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

  inspectOldConfig(prefix = CROS_IDE_PREFIX):
    | {
        globalValue?: T;
        workspaceValue?: T;
        workspaceFolderValue?: T;
      }
    | undefined {
    return vscode.workspace.getConfiguration(prefix).inspect(this.section);
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

  async update(
    value: T | undefined,
    target = this.configurationTarget
  ): Promise<void> {
    await vscode.workspace
      .getConfiguration(this.prefix)
      .update(this.section, value, target);
  }

  async updateOldConfig(
    value: T | undefined,
    target = this.configurationTarget,
    prefix = CROS_IDE_PREFIX
  ): Promise<void> {
    await vscode.workspace
      .getConfiguration(prefix)
      .update(this.section, value, target);
  }
}

export type {ConfigValue};

export const board = new ConfigValue<string>('board', CHROMIUMIDE_PREFIX);

export const boardsAndPackages = {
  showWelcomeMessage: new ConfigValue<boolean>(
    'boardsAndPackages.showWelcomeMessage',
    CHROMIUMIDE_PREFIX
  ),
};

export const boilerplate = {
  enabled: new ConfigValue<boolean>('boilerplate.enabled', CHROMIUMIDE_PREFIX),
  guessNamespace: new ConfigValue<boolean>(
    'boilerplate.guessNamespace',
    CHROMIUMIDE_PREFIX
  ),
};

export const codeSearch = {
  // TODO: Consider aligning the setting name.
  instance: new ConfigValue<'public' | 'internal' | 'gitiles'>(
    'codeSearch',
    CHROMIUMIDE_PREFIX
  ),
  // TODO: Consider aligning the setting name.
  openWithRevision: new ConfigValue<boolean>(
    'codeSearchHash',
    CHROMIUMIDE_PREFIX
  ),
};

export const gerrit = {
  enabled: new ConfigValue<boolean>('gerrit.enabled', CHROMIUMIDE_PREFIX),
};

export const underDevelopment = {
  chromiumBuild: new ConfigValue<boolean>(
    'underDevelopment.chromiumBuild',
    CHROMIUMIDE_PREFIX
  ),
  crosFormat: new ConfigValue<boolean>(
    'underDevelopment.crosFormat',
    CHROMIUMIDE_PREFIX
  ),
  deviceManagement: new ConfigValue<boolean>(
    'underDevelopment.deviceManagement',
    CHROMIUMIDE_PREFIX
  ),
  gerrit: new ConfigValue<boolean>(
    'underDevelopment.gerrit',
    CHROMIUMIDE_PREFIX
  ),
  platform2GtestDebugging: new ConfigValue<boolean>(
    'underDevelopment.platform2GtestDebugging',
    CHROMIUMIDE_PREFIX
  ),
  platformEc: new ConfigValue<boolean>(
    'underDevelopment.platformEC',
    CHROMIUMIDE_PREFIX
  ),
  relatedFiles: new ConfigValue<boolean>(
    'underDevelopment.relatedFiles',
    CHROMIUMIDE_PREFIX
  ),
  systemLogViewer: new ConfigValue<boolean>(
    'underDevelopment.systemLogViewer',
    CHROMIUMIDE_PREFIX
  ),
  tast: new ConfigValue<boolean>('underDevelopment.tast', CHROMIUMIDE_PREFIX),
  testCoverage: new ConfigValue<boolean>(
    'underDevelopment.testCoverage',
    CHROMIUMIDE_PREFIX
  ),
  metricsGA4: new ConfigValue<boolean>(
    'underDevelopment.metricsGA4',
    CHROMIUMIDE_PREFIX
  ),
};

export const deviceManagement = {
  devices: new ConfigValue<string[]>(
    'deviceManagement.devices',
    CHROMIUMIDE_PREFIX
  ),
};

export const metrics = {
  collectMetrics: new ConfigValue<boolean>(
    'metrics.collectMetrics',
    CHROMIUMIDE_PREFIX
  ),
  showMessage: new ConfigValue<boolean>(
    'metrics.showMessage',
    CHROMIUMIDE_PREFIX
  ),
};

export const ownersFiles = {
  links: new ConfigValue<boolean>('ownersFiles.links', CHROMIUMIDE_PREFIX),
};

export const paths = {
  depotTools: new ConfigValue<string>('paths.depotTools', CHROMIUMIDE_PREFIX),
};

export const platformEc = {
  board: new ConfigValue<string>('platformEC.board', CHROMIUMIDE_PREFIX),
  mode: new ConfigValue<'RO' | 'RW'>('platformEC.mode', CHROMIUMIDE_PREFIX),
  build: new ConfigValue<'Makefile' | 'Zephyr'>(
    'platformEC.build',
    CHROMIUMIDE_PREFIX
  ),
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
  ashBuildDir: new ConfigValue<string>(
    'chrome.ashBuildDir',
    CHROMIUMIDE_PREFIX
  ),
  dutName: new ConfigValue<string>('chrome.dutName', CHROMIUMIDE_PREFIX),
  outputDirectories: new ConfigValue<boolean>(
    'chrome.outputDirectories',
    CHROMIUMIDE_PREFIX
  ),
};

export const spellchecker = new ConfigValue<boolean>(
  'spellchecker',
  CHROMIUMIDE_PREFIX
);

export const testCoverage = {
  enabled: new ConfigValue<boolean>('testCoverage.enabled', CHROMIUMIDE_PREFIX),
};

export const TEST_ONLY = {
  CROS_IDE_PREFIX,
  CHROMIUMIDE_PREFIX,
};
