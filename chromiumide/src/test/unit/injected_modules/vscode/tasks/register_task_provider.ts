// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export const registerTaskProvider: typeof vscode.tasks.registerTaskProvider = (
  _task: string,
  _provider: vscode.TaskProvider<vscode.Task>
): vscode.Disposable => {
  return vscode.Disposable.from();
};
