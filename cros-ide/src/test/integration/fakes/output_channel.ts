// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

/**
 * Fake output channel.
 */
export class FakeOutputChannel implements vscode.OutputChannel {
  get name(): string {
    return 'fake-channel';
  }
  append(value: string) {
    console.log(value);
  }
  appendLine(value: string) {
    console.log(`${value}\n`);
  }
  replace(_value: string) {}
  clear() {}
  show() {}
  hide() {}
  dispose() {}
}
