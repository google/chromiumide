// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as path from 'path';
import {runTests} from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './index');

    // Use --disable-gpu to clear some errors reported in the log.
    //
    // Use . as the workspace to open when the VS Code starts.
    // This prevents VS Code from opening the last used workspace,
    // which could involve connecting somewhere over ssh.
    const launchArgs = ['--disable-gpu', '.'];

    // Download VS Code, unzip it and run the integration test
    await runTests({extensionDevelopmentPath, extensionTestsPath, launchArgs});
  } catch (err) {
    console.error('Failed to run tests');
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }
}

void main();
