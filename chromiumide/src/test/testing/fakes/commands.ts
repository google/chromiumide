// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

type Commands = typeof vscode.commands;

// VSCode commands are not type safe.
interface Callback {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (...args: any[]): unknown;
}

interface TextEditorCallback {
  (
    textEditor: vscode.TextEditor,
    edit: vscode.TextEditorEdit,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ): void;
}

/**
 * A fake implementation of `vscode.commands`.
 */
export class FakeCommands implements Commands {
  private readonly commands = new Map<string, Callback>([
    // TODO(oka): Install fake setContext implementation.
    ['setContext', async () => {}],
  ]);

  constructor(
    private readonly window: {activeTextEditor?: vscode.TextEditor}
  ) {}

  registerCommand(
    id: string,
    callback: Callback,
    thisArg?: unknown
  ): vscode.Disposable {
    callback = callback.bind(thisArg);
    // The real implementation throws when the command already exists, but in
    // tests its useful to overwrite existing commands.
    this.commands.set(id, callback);
    return {
      dispose: () => {
        this.commands.delete(id);
      },
    };
  }

  registerTextEditorCommand(
    id: string,
    callback: TextEditorCallback,
    thisArg?: unknown
  ): vscode.Disposable {
    callback = callback.bind(thisArg);
    return this.registerCommand(id, (...args) => {
      const editor = this.window.activeTextEditor;
      if (!editor) {
        throw new Error(
          `Cannot execute ${id} because there is no active text editor.`
        );
      }
      void editor.edit(edit => {
        callback(editor, edit, ...args);
      });
    });
  }

  async executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
    const callback = this.commands.get(id);
    if (!callback) {
      throw new Error(`Command ${id} not found.`);
    }
    return callback(...args) as T | Promise<T>;
  }

  async getCommands(filterInternal?: boolean): Promise<string[]> {
    return [...this.commands.keys()].filter(
      id => !filterInternal || !id.startsWith('_')
    );
  }
}
