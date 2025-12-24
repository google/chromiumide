// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export class TestMessage implements vscode.TestMessage {
  expectedOutput?: string | undefined;
  actualOutput?: string | undefined;
  location?: vscode.Location | undefined;

  constructor(public message: string) {}
}
