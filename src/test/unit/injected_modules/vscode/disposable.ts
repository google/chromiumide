// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode'; // import types only

export class Disposable implements vscode.Disposable {
  static from(...disposableLikes: {dispose: () => void}[]): vscode.Disposable {
    return new Disposable(() => {
      for (const d of disposableLikes) {
        d.dispose();
      }
    });
  }

  constructor(private readonly callOnDispose: Function) {}

  dispose(): void {
    this.callOnDispose();
  }
}
