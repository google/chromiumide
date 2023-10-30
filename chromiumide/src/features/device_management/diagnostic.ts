// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export type DiagnosticButton = {
  readonly name: string;
  action(): Promise<void>;
};

// Creates a button to open output logs.
export function createShowLogsButton(
  output: vscode.OutputChannel
): DiagnosticButton {
  return {
    name: 'Show logs',
    async action() {
      output.show();
    },
  };
}

export function showErrorMessageWithButtons(
  message: string,
  buttons: DiagnosticButton[]
): void {
  void (async () => {
    const names = buttons.map(x => x.name);
    const choice = await vscode.window.showErrorMessage(message, ...names);
    for (const button of buttons) {
      if (choice === button.name) {
        await button.action();
      }
    }
  })();
}

export class DiagnosedError extends Error {
  constructor(
    cause: Error,
    suggestion: string,
    readonly buttons: readonly DiagnosticButton[]
  ) {
    super(suggestion ? cause.message + '; ' + suggestion : cause.message);
  }
}

/**
 * Given the error and output from a failed SSH command, returns an enhanced
 * error value with a message to the user and the buttons to run an action to
 * address the issue.
 *
 * Example:
 *   const err = diagnoseSshError(cause, output);
 *   showErrorMessageWithButtons(err.message, err.buttons);
 */
export function diagnoseSshError(cause: Error, output: string): DiagnosedError {
  if (output.includes('try running gcert ')) {
    // TODO(oka): Add a button to run gcert. For code-server simply running gcert
    // in the integrated terminal results in failure.
    return new DiagnosedError(cause, 'try running gcert and retry', []);
  }
  if (
    output.includes('Could not resolve the IP address for host ') ||
    output.includes('Could not resolve hostname ')
  ) {
    return new DiagnosedError(
      cause,
      'confirm lab DUTs access is configured following go/chromeos-lab-duts-ssh',
      [
        {
          name: 'Open doc',
          async action() {
            await vscode.env.openExternal(
              vscode.Uri.parse('http://go/chromeos-lab-duts-ssh')
            );
          },
        },
      ]
    );
  }
  return new DiagnosedError(cause, '', []);
}
