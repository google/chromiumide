// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export class TestRun implements vscode.TestRun {
  constructor(
    readonly name: string | undefined,
    readonly isPersisted: boolean
  ) {}

  readonly token: vscode.CancellationToken =
    new vscode.CancellationTokenSource().token;

  enqueued(_test: vscode.TestItem): void {}

  started(_test: vscode.TestItem): void {}

  skipped(_test: vscode.TestItem): void {}

  failed(
    _test: vscode.TestItem,
    _message: vscode.TestMessage | readonly vscode.TestMessage[],
    _duration?: number | undefined
  ): void {}

  errored(
    _test: vscode.TestItem,
    _message: vscode.TestMessage | readonly vscode.TestMessage[],
    _duration?: number | undefined
  ): void {}

  passed(_test: vscode.TestItem, _duration?: number | undefined): void {}

  appendOutput(
    _output: string,
    _location?: vscode.Location | undefined,
    _test?: vscode.TestItem | undefined
  ): void {}

  end(): void {}
}
