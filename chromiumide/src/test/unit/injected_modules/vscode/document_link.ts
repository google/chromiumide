// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export class DocumentLink {
  range: vscode.Range;
  target?: vscode.Uri;
  tooltip?: string;

  constructor(range: vscode.Range, target?: vscode.Uri) {
    this.range = range;
    this.target = target;
  }
}
