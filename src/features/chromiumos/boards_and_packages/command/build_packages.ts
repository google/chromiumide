// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

/**
 * Runs `cros build-packages --board $BOARD` on terminal.
 */
export async function buildPackages(board: string): Promise<void> {
  const terminal = vscode.window.createTerminal(`Build ${board} packages`);

  // Don't exec the command to allow the user to examine error messages if any.
  terminal.sendText(`cros build-packages --board ${board}`);
  terminal.show();

  const listener = vscode.window.onDidCloseTerminal(closedTerminal => {
    if (terminal !== closedTerminal) return;
    terminal.dispose();
    listener.dispose();
  });
}
