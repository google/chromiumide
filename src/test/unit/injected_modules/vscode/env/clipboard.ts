// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

/** Fake implementation of vscode.Clipboard that only keeps data internally. */
export class FakeClipboard implements vscode.Clipboard {
  private value = '';

  async readText(): Promise<string> {
    return this.value;
  }

  async writeText(value: string): Promise<void> {
    this.value = value;
  }
}
