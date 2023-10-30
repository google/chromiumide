// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as vscode from 'vscode';

export class TestRunProfile implements vscode.TestRunProfile {
  readonly supportsContinuousRun: boolean = false;

  constructor(
    public label: string,
    readonly kind: vscode.TestRunProfileKind,
    public runHandler: (
      request: vscode.TestRunRequest,
      token: vscode.CancellationToken
    ) => void | Thenable<void>,
    public isDefault: boolean,
    public tag: vscode.TestTag | undefined
  ) {}

  configureHandler: (() => void) | undefined;

  dispose(): void {}
}
