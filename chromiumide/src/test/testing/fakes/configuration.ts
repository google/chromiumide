// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {readPackageJson} from '../package_json';

// Fake implementation of vscode.WorkspaceConfiguration.
// It only implements a portion of WorkspaceConfiguration used by the extension; for example, index
// signature is not implemented.
export class FakeWorkspaceConfiguration<T> {
  private readonly values = {
    [vscode.ConfigurationTarget.Global]: new Map<string, T>(),
    [vscode.ConfigurationTarget.Workspace]: new Map<string, T>(),
    [vscode.ConfigurationTarget.WorkspaceFolder]: new Map<string, T>(),
  };

  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private constructor(
    private readonly section: string,
    private readonly defaults: ReadonlyMap<string, T>
  ) {}

  static fromSection<T>(
    section: string,
    subscriptions?: vscode.Disposable[]
  ): vscode.WorkspaceConfiguration & FakeWorkspaceConfiguration<T> {
    return this.fromDefaults(
      section,
      readDefaultsFromPackageJson(section) as Map<string, T>,
      subscriptions
    );
  }

  static fromDefaults<T>(
    section: string,
    defaults: ReadonlyMap<string, T>,
    subscriptions?: vscode.Disposable[]
  ): vscode.WorkspaceConfiguration & FakeWorkspaceConfiguration<T> {
    const res = new this(section, defaults);
    subscriptions?.push(res);
    return res as vscode.WorkspaceConfiguration & FakeWorkspaceConfiguration<T>;
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  clear(): void {
    for (const m of Object.values(this.values)) {
      m.clear();
    }
  }

  get(section: string, defaultValue?: T): T | undefined {
    for (const target of [
      vscode.ConfigurationTarget.WorkspaceFolder,
      vscode.ConfigurationTarget.Workspace,
      vscode.ConfigurationTarget.Global,
    ]) {
      const v = this.values[target].get(section);
      if (v !== undefined) {
        return v;
      }
    }
    return this.defaults.get(section) ?? defaultValue;
  }

  has(section: string): boolean {
    return this.get(section) !== undefined;
  }

  inspect(section: string):
    | {
        defaultValue?: T;
        globalValue?: T;
        workspaceValue?: T;
        workspaceFolderValue?: T;
      }
    | undefined {
    return {
      defaultValue: this.defaults.get(section),
      globalValue: this.values[vscode.ConfigurationTarget.Global].get(section),
      workspaceValue:
        this.values[vscode.ConfigurationTarget.Workspace].get(section),
      workspaceFolderValue:
        this.values[vscode.ConfigurationTarget.WorkspaceFolder].get(section),
    };
  }

  async update(
    section: string,
    value: T | undefined,
    target = vscode.ConfigurationTarget.WorkspaceFolder
  ): Promise<void> {
    const values = this.values[target];

    if (value === undefined) {
      values.delete(section);
    } else {
      values.set(section, value);
    }
    this.onDidChangeEmitter.fire({
      affectsConfiguration: s => s === this.section + '.' + section,
    });
  }
}

const implicitDefaultValues = {
  string: '',
  boolean: false,
  array: [],
} as const;

function readDefaultsFromPackageJson(section: string): Map<string, unknown> {
  const packageJson = readPackageJson();
  const configs = packageJson.contributes.configuration.properties;

  const defaults = new Map<string, unknown>();
  const prefix = `${section}.`;
  for (const key of Object.keys(configs)) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const schema = configs[key];
    const defaultValue = schema.default ?? implicitDefaultValues[schema.type];
    defaults.set(key.substring(prefix.length), defaultValue);
  }

  return defaults;
}
