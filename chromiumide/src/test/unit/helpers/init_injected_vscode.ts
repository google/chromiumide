// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as vscode from 'vscode';
import {extensionNameLower} from '../../../../shared/app/common/extension_name';
import * as fakes from '../../testing/fakes';
import {setConfigurationProviderForTesting} from '../injected_modules/vscode/workspace/configuration';

function initFakeConfigs(): void {
  const fakeConfig = fakes.FakeWorkspaceConfiguration.fromSection(
    extensionNameLower()
  );

  function getConfiguration(section?: string): vscode.WorkspaceConfiguration {
    if (section !== extensionNameLower()) {
      throw new Error(
        'vscode.workspace.getConfiguration called for foreign configs'
      );
    }
    return fakeConfig as vscode.WorkspaceConfiguration;
  }

  setConfigurationProviderForTesting({
    getConfiguration,
    onDidChangeConfiguration: fakeConfig.onDidChange,
  });

  // Clear configuration before each test case.
  beforeEach(() => {
    fakeConfig.clear();
  });
}

initFakeConfigs();
