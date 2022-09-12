// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode'; // import types only

/**
 * An OutputChannel that discards logs.
 */
export class VoidOutputChannel implements vscode.OutputChannel {
  constructor(public readonly name = 'void') {}

  append(): void {}
  appendLine(): void {}
  replace(): void {}
  clear(): void {}
  show(): void {}
  hide(): void {}
  dispose(): void {}
}

/**
 * An OutputChannel that sends logs to console.
 */
export class ConsoleOutputChannel implements vscode.OutputChannel {
  constructor(public readonly name = 'console') {}

  append(value: string): void {
    process.stdout.write(value);
  }
  appendLine(value: string): void {
    process.stdout.write(`${value}\n`);
  }

  replace(): void {}
  clear(): void {}
  show(): void {}
  hide(): void {}
  dispose(): void {}
}
