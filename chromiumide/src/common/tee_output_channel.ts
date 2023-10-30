// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

type PickedOutputChannel = Pick<vscode.OutputChannel, 'append'>;

export class TeeOutputChannel implements PickedOutputChannel {
  constructor(
    private readonly o1: PickedOutputChannel,
    private readonly o2: PickedOutputChannel
  ) {}

  append(value: string): void {
    this.o1.append(value);
    this.o2.append(value);
  }
}
