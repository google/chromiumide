// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';

import * as vscode from 'vscode';

interface RootConfig {
  [key: string]: ChildConfig;
}

interface ChildConfig {
  [key: string]: unknown;
}

class FakeWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
  static create(config: ChildConfig): vscode.WorkspaceConfiguration {
    return new FakeWorkspaceConfiguration(config);
  }
  private constructor(private readonly config: ChildConfig) {}

  get<T>(section: string, defaultValue?: T): T | undefined {
    return section && section in this.config
      ? (this.config[section] as T)
      : defaultValue;
  }
  has(section: string): boolean {
    return section in this.config;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inspect(_section: string): any {
    throw new Error('Unsupported; please implement it');
  }
  async update(section: string, value: unknown) {
    this.config[section] = value;
  }
}

/**
 * Creates a fake implementation of vscode.workspace.getConfiguration with an
 * underlying in-memory configuration object.
 *
 * Usage:
 * vscodeSpy.workspace.getConfiguration.and.callFake(fakeGetConfiguration());
 * vscode.workspace.getConfiguration('foo').update('bar', 'baz');
 */
export function fakeGetConfiguration(): typeof vscode.workspace.getConfiguration {
  const config: RootConfig = {};
  return section => {
    if (!section || section.includes('.')) {
      throw new Error(
        `seciton ${section} is unsupported; please update the fake implementation`
      );
    }
    if (!(section in config)) {
      config[section] = {};
    }
    return FakeWorkspaceConfiguration.create(config[section]);
  };
}
