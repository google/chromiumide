// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

const loggerInstance = vscode.window.createOutputChannel(
  'ChromiumIDE: UI Actions'
);

/**
 * Return the logger that should be used by actions done in UI. For example,
 * navigating to CodeSearch, opening listing packages worked on (view), and so on.
 *
 * Tasks that run in background or produce lots of logs should create their own loggers.
 * See cros lint and C++ code completion for examples.
 */
export function getUiLogger(): vscode.OutputChannel {
  return loggerInstance;
}

export const SHOW_UI_LOG: vscode.Command = {
  command: 'chromiumide.showUiLog',
  title: '',
};
