// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

type PickedOutputChannel = Pick<vscode.OutputChannel, 'append'>;

/**
 * Wraps an OutputChannel object and passes output to it line by line.
 */
export class LineBufferedOutputAdapter implements PickedOutputChannel {
  private data = '';

  constructor(private readonly wrappedOutput: PickedOutputChannel) {}

  append(data: string): void {
    this.data += data;
    for (
      let idx = this.data.indexOf('\n');
      idx > -1;
      idx = this.data.indexOf('\n')
    ) {
      this.wrappedOutput.append(this.data.slice(0, idx + 1));
      this.data = this.data.slice(idx + 1);
    }
  }

  /**
   * Send buffered data to wrapped output, even if it doesn't end with a line break.
   */
  flush(): void {
    if (this.data.length > 0) {
      this.wrappedOutput.append(this.data);
    }
    this.data = '';
  }
}
