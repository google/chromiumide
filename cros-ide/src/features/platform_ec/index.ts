// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as statusBar from './status_bar';

export function activate(context: vscode.ExtensionContext) {
  statusBar.activate(context);
}
