// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This is the only file that can call vscode.workspace.getConfiguration().
/* eslint-disable no-restricted-syntax */

import * as vscode from 'vscode';

// Old prefix before ChromiumIDE rebranding. We should keep it for migration.
const OLD_CROS_IDE_PREFIX = 'cros-ide';

// Prefixes to be added to all config sections.
// The Go extension, which the user can have, requires a different prefix.
const CHROMIUMIDE_PREFIX = 'chromiumide';
const GO_PREFIX = 'go';

// Wraps vscode API for safer configuration access.
// It ensures that a config entry is always accessed with consistent options,
// such as value type and default value.
class ConfigValue<T> {
  constructor(
    private readonly section: string,
    private readonly prefix = CHROMIUMIDE_PREFIX,
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

  inspectOldConfig(prefix = OLD_CROS_IDE_PREFIX):
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
    prefix = OLD_CROS_IDE_PREFIX
  ): Promise<void> {
    await vscode.workspace
      .getConfiguration(prefix)
      .update(this.section, value, target);
  }

  /**
   * Registers a listener that is called whenever the config was affected and may have been changed.
   */
  readonly onDidChange: vscode.Event<T> = (
    listener,
    thisArgs?,
    disposables?
  ) => {
    if (thisArgs) {
      listener = listener.bind(thisArgs);
    }
    const disposable = vscode.workspace.onDidChangeConfiguration(e => {
      const section = this.prefix + '.' + this.section;
      if (!e.affectsConfiguration(section)) return;
      listener(this.get());
    });
    if (disposables) disposables.push(disposable);
    return disposable;
  };
}

export type {ConfigValue};

export const board = new ConfigValue<string>('board');

export const leagcyBoardsAndPackages = {
  showWelcomeMessage: new ConfigValue<boolean>(
    'legacyBoardsAndPackages.showWelcomeMessage'
  ),
};

export const boardsAndPackages = {
  /** User's favorite categories. */
  favoriteCategories: new ConfigValue<string[]>(
    'boardsAndPackages.favoriteCategories'
  ),
  /** Qualified package names representing user's favorite packages. */
  favoritePackages: new ConfigValue<string[]>(
    'boardsAndPackages.favoritePackages'
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

export const crosFormat = {
  enabled: new ConfigValue<boolean>('crosFormat.enabled'),
};

export const ebuildSupport = {
  enabled: new ConfigValue<boolean>('ebuildSupport.enabled'),
};

export const gerrit = {
  enabled: new ConfigValue<boolean>('gerrit.enabled'),
};

export const hints = {
  tooLargeWorkspace: new ConfigValue<boolean>('hints.tooLargeWorkspace'),
};

export const underDevelopment = {
  autoninjaImprovements: new ConfigValue<boolean>(
    'underDevelopment.autoninjaImprovements'
  ),
  buildAndDeploy: new ConfigValue<boolean>('underDevelopment.buildAndDeploy'),
  chromiumBuild: new ConfigValue<boolean>('underDevelopment.chromiumBuild'),
  platform2GtestDebugging: new ConfigValue<boolean>(
    'underDevelopment.platform2GtestDebugging'
  ),
  platformEc: new ConfigValue<boolean>('underDevelopment.platformEC'),
  relatedFiles: new ConfigValue<boolean>('underDevelopment.relatedFiles'),
  tastDebugging: new ConfigValue<boolean>('underDevelopment.tastDebugging'),
  systemLogViewer: new ConfigValue<boolean>('underDevelopment.systemLogViewer'),
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
  alternateTools: new ConfigValue<{[prop: string]: string}>(
    'alternateTools',
    GO_PREFIX
  ),
};

const chromeGtest = {
  enabled: new ConfigValue<boolean>('chrome.gtest.enabled'),
  botMode: new ConfigValue<boolean>('chrome.gtest.botMode'),
};

export const chrome = {
  ashBuildDir: new ConfigValue<string>('chrome.ashBuildDir'),
  dutName: new ConfigValue<string>('chrome.dutName'),
  outputDirectories: new ConfigValue<boolean>('chrome.outputDirectories'),
  gtest: chromeGtest,
};

export const spellchecker = new ConfigValue<boolean>('spellchecker');

export const tast = {
  enabled: new ConfigValue<boolean>('tast.enabled'),
  extraArgs: new ConfigValue<string[]>('tast.extraArgs'),
  showGoAlternateToolsChangedMessage: new ConfigValue<boolean>(
    'tast.showGoAlternateToolsChangedMessage'
  ),
};

export const testCoverage = {
  enabled: new ConfigValue<boolean>('testCoverage.enabled'),
};

export const TEST_ONLY = {
  CHROMIUMIDE_PREFIX,
};
