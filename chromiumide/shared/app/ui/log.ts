// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {extensionName} from '../common/extension_name';

let loggerInstance: vscode.OutputChannel | undefined = undefined;

/**
 * Return the logger that should be used by actions done in UI. For example,
 * navigating to CodeSearch, opening listing packages worked on (view), and so on.
 *
 * Tasks that run in background or produce lots of logs should create their own loggers.
 * See cros lint and C++ xrefs for examples.
 */
export function getUiLogger(): vscode.OutputChannel {
  // The vscode spy for Cider extension tests are available only in each it().
  // Create the instance lazily to avoid running the line out of the scope which
  // cause test suite failure if the instance is created after the tests ended.
  if (!loggerInstance) {
    loggerInstance = vscode.window.createOutputChannel(
      `${extensionName()}: UI Actions`
    );
  }
  return loggerInstance;
}

export const SHOW_UI_LOG: vscode.Command = {
  command: 'chromiumide.showUiLog',
  title: '',
};
