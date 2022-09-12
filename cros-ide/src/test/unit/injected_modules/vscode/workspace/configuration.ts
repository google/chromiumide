// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode'; // import types only

export interface ConfigurationProvider {
  getConfiguration(section?: string): vscode.WorkspaceConfiguration;
  onDidChangeConfiguration: vscode.Event<vscode.ConfigurationChangeEvent>;
}

let theProvider: ConfigurationProvider | undefined = undefined;

export function setConfigurationProviderForTesting(
  provider: ConfigurationProvider
): void {
  theProvider = provider;
}

export function getConfiguration(
  section?: string
): vscode.WorkspaceConfiguration {
  if (theProvider === undefined) {
    throw new Error('ConfigurationProvider is unavailable');
  }
  return theProvider.getConfiguration(section);
}

export const onDidChangeConfiguration: vscode.Event<
  vscode.ConfigurationChangeEvent
> = (...args) => {
  if (theProvider === undefined) {
    throw new Error('ConfigurationProvider is unavailable');
  }
  return theProvider.onDidChangeConfiguration(...args);
};
