// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

const commandsToDismissError = new Set<string>();

type Callback<A extends Array<unknown>, R> = (...args: A) => R;

async function executeCommand<A extends unknown[], R>(
  command: string,
  callback: Callback<A, R>,
  args: A
) {
  try {
    return await callback(...args);
  } catch (e) {
    if (!commandsToDismissError.has(command)) {
      void (async () => {
        const choice = await vscode.window.showErrorMessage(
          `Command ${command} failed: ${e}`,
          'Ignore'
        );
        if (choice) {
          commandsToDismissError.add(command);
        }
      })();
    }
    throw e;
  }
}

/**
 * Register a command. This is a wrapper of vscode.commands.registerCommand
 * which does error handling on callback failure.
 */
export function vscodeRegisterCommand<A extends unknown[]>(
  command: string,
  callback: Callback<A, unknown>
): vscode.Disposable {
  return vscode.Disposable.from(
    // This is the only place vscode.commands.registerCommand can be used.
    // eslint-disable-next-line no-restricted-syntax
    vscode.commands.registerCommand(command, async (...args: A) => {
      return executeCommand(command, callback, args);
    }),
    new vscode.Disposable(() => {
      // For testability, clear the state on unregistration.
      commandsToDismissError.delete(command);
    })
  );
}

/**
 * Register a text editor command. This is a wrapper of vscode.commands.registerTextEditorCommand
 * which does error handling on callback failure.
 */
export function vscodeRegisterTextEditorCommand<A extends unknown[]>(
  command: string,
  callback: Callback<
    [textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: A],
    unknown
  >
): vscode.Disposable {
  return vscode.Disposable.from(
    // This is the only place vscode.commands.registerTextEditorCommand can be used.
    // eslint-disable-next-line no-restricted-syntax
    vscode.commands.registerTextEditorCommand(
      command,
      (
        textEditor: vscode.TextEditor,
        edit: vscode.TextEditorEdit,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...args: any[]
      ) => {
        // Text editor commands have a `void` return value, thus we do not return the `Promise`
        // here.
        void executeCommand(command, callback, [
          textEditor,
          edit,
          ...(args as A),
        ]);
      }
    ),
    new vscode.Disposable(() => {
      // For testability, clear the state on unregistration.
      commandsToDismissError.delete(command);
    })
  );
}
