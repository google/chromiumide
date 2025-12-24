// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export const startDebugging: typeof vscode.debug.startDebugging = async (
  _folder: vscode.WorkspaceFolder | undefined,
  _nameOrConfiguration: string | vscode.DebugConfiguration,
  _parentSessionOrOptions?:
    | vscode.DebugSession
    | vscode.DebugSessionOptions
    | undefined
): Promise<boolean> => {
  return true;
};
