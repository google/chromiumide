// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export class TabInputText implements vscode.TabInputText {
  constructor(readonly uri: vscode.Uri) {}
}
