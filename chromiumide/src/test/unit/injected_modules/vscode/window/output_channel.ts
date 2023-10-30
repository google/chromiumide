// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode'; // import types only

// Copy of fakes.VoidOutputChannel.
// We copy it here because the injected vscode module cannot import
// other packages (b/237621808).
class VoidOutputChannel implements vscode.OutputChannel {
  constructor(readonly name: string) {}

  append(): void {}
  appendLine(): void {}
  replace(): void {}
  clear(): void {}
  show(): void {}
  hide(): void {}
  dispose(): void {}
}

export function createOutputChannel(name: string): vscode.OutputChannel {
  return new VoidOutputChannel(name);
}
