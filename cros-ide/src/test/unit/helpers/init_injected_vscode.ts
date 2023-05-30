// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import 'jasmine';
import * as path from 'path';
import * as vscode from 'vscode';
import * as config from '../../../services/config';
import * as fakes from '../../testing/fakes';
import {setConfigurationProviderForTesting} from '../injected_modules/vscode/workspace/configuration';

function initFakeConfigs(): void {
  const fakeOldConfig = new fakes.FakeWorkspaceConfiguration(
    path.join(__dirname, '../../../../package.json'),
    config.TEST_ONLY.CROS_IDE_PREFIX
  );
  const fakeConfig = new fakes.FakeWorkspaceConfiguration(
    path.join(__dirname, '../../../../package.json'),
    config.TEST_ONLY.CHROMIUMIDE_PREFIX
  );

  function getConfiguration(section?: string): vscode.WorkspaceConfiguration {
    switch (section) {
      case config.TEST_ONLY.CROS_IDE_PREFIX:
        return fakeOldConfig as vscode.WorkspaceConfiguration;
      case config.TEST_ONLY.CHROMIUMIDE_PREFIX:
        return fakeConfig as vscode.WorkspaceConfiguration;
      default:
        throw new Error(
          'vscode.workspace.getConfiguration called for foreign configs'
        );
    }
  }

  setConfigurationProviderForTesting({
    getConfiguration,
    onDidChangeConfiguration: fakeOldConfig.onDidChange,
  });

  // Clear configuration before each test case.
  beforeEach(() => {
    fakeOldConfig.clear();
  });
}

initFakeConfigs();
