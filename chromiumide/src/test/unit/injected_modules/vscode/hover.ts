// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export class Hover implements vscode.Hover {
  readonly contents: Array<vscode.MarkdownString | vscode.MarkedString>;
  readonly range?: vscode.Range;
  constructor(contents: string, range: vscode.Range) {
    this.contents = [contents];
    this.range = range;
  }
}
