// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import {COMMAND_SHOW_LOGS} from './commands';

interface AsyncTask {
  id: string;
  message: string;
}

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly tasks: AsyncTask[] = [];
  private active = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      0
    );
    this.item.command = COMMAND_SHOW_LOGS;
    this.updateText();
  }

  dispose(): void {
    this.item.dispose();
  }

  show(): void {
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  startProgress(id: string, message: string): void {
    this.tasks.push({id, message});
    this.updateText();
  }

  endProgress(id: string): void {
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      if (this.tasks[i].id === id) {
        this.tasks.splice(i, 1);
        break;
      }
    }
    this.updateText();
  }

  async withProgress<T>(message: string, body: () => Promise<T>): Promise<T> {
    const id = crypto.randomUUID();
    this.startProgress(id, message);
    try {
      return await body();
    } finally {
      this.endProgress(id);
    }
  }

  private updateText(): void {
    if (this.tasks.length === 0) {
      this.item.text = 'Chromium Java';
    } else {
      const {message} = this.tasks[this.tasks.length - 1];
      this.item.text = `$(loading~spin) Chromium Java: ${message}`;
    }
  }
}
