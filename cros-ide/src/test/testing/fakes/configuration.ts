// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as fs from 'fs';

// Fake implementation of vscode.WorkspaceConfiguration.
// It only implements a portion of WorkspaceConfiguration used by the extension; for example, index
// signature is not implemented.
export class FakeWorkspaceConfiguration {
  private readonly defaults: Map<string, unknown>;
  private readonly values = new Map<string, unknown>();

  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(packageJsonPath: string, section: string) {
    this.defaults = readDefaultsFromPackageJson(packageJsonPath, section);
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  clear(): void {
    this.values.clear();
  }

  get(section: string, defaultValue?: unknown): unknown {
    return (
      this.values.get(section) ?? this.defaults.get(section) ?? defaultValue
    );
  }

  has(section: string): boolean {
    return this.get(section) !== undefined;
  }

  inspect(_section: string): never {
    throw new Error('FakeWorkspaceConfiguration does not support inspect()');
  }

  async update(section: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(section);
    } else {
      this.values.set(section, value);
    }
    this.onDidChangeEmitter.fire({affectsConfiguration: () => true});
  }
}

interface PackageJson {
  contributes: {
    configuration: {
      properties: {
        [key: string]: {
          type: 'string' | 'boolean' | 'array';
          default?: unknown;
        };
      };
    };
  };
}

const implicitDefaultValues = {
  string: '',
  boolean: false,
  array: [],
} as const;

function readDefaultsFromPackageJson(
  packageJsonPath: string,
  section: string
): Map<string, unknown> {
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, {encoding: 'utf-8'})
  ) as PackageJson;
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
