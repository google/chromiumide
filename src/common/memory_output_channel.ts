// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export class MemoryOutputChannel
  implements Pick<vscode.OutputChannel, 'append'>
{
  private values: string[] = [];

  append(value: string): void {
    this.values.push(value);
  }

  /** All the output */
  get output(): string {
    const res = this.values.join('');
    this.values = [res];
    return res;
  }
}
