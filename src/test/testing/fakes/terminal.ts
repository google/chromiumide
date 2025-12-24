// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {VscodeEmitters} from '../doubles';
import type * as vscode from 'vscode';

export class FakeTerminal implements vscode.Terminal {
  name = 'fake';
  processId = Promise.resolve(0);
  creationOptions: Readonly<
    vscode.TerminalOptions | vscode.ExtensionTerminalOptions
  > = {};
  exitStatus: vscode.TerminalExitStatus | undefined;
  state: vscode.TerminalState = {isInteractedWith: false};
  sendText(text: string, addNewLine?: boolean): void {
    this.texts += text + (addNewLine === false ? '' : '\n');
    this.opts?.onSendText?.(text, addNewLine);
  }
  show(_preserveFocus?: boolean): void {}
  hide(): void {}
  dispose(): void {}

  // Custom methods for testing follow.
  constructor(
    private readonly opts?: {
      onSendText?: (text: string, addNewLine?: boolean) => void;
      vscodeEmitters?: VscodeEmitters;
    }
  ) {}

  private texts = '';

  getTexts(): string {
    return this.texts;
  }

  close(exitStatus: vscode.TerminalExitStatus): void {
    this.exitStatus = exitStatus;
    this.opts?.vscodeEmitters?.window.onDidCloseTerminal.fire(this);
  }
}
