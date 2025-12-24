// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export class StatusBarItem {
  // some fields are omitted to avoid having to create more fakes

  command: string | vscode.Command | undefined = '';
  id = 'google.cros-ide';
  name: string | undefined = '';
  text = '';
  tooltip: string | vscode.MarkdownString | undefined = '';

  constructor(
    readonly alignment = StatusBarAlignment.Left,
    readonly priority = 1 as number | undefined
  ) {}

  dispose(): void {}
  show(): void {}
  hide(): void {}
}

export function createStatusBarItem(
  statusBarAlignment?: StatusBarAlignment,
  priority?: number
): StatusBarItem {
  return new StatusBarItem(statusBarAlignment, priority);
}
