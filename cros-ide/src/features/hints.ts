// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as sudo from '../services/sudo';

/**
 * Activates the hint handlers.
 *
 * When adding hints on user actions, instead of embedding hint logic into
 * individual modules, you can provide event emitters there and subscribe
 * to them here, by which you can decouple hint logic and individual modules.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    sudo.onDidRunSudoWithPassword(onDidRunSudoWithPassword)
  );
}

const maxSudoPasswordIntervalInMilli = 3 * 60 * 60 * 1000; // 3 hours

let lastDidRunSudoWithPassword: Date | undefined = undefined;
let didShowSudoHint = false;

/**
 * Show a hint to set up sudo to request passwords less frequently
 * when the user needed to type passwords twice in a row.
 */
function onDidRunSudoWithPassword(): void {
  const now = new Date();
  if (lastDidRunSudoWithPassword !== undefined) {
    const elapsed = now.getTime() - lastDidRunSudoWithPassword.getTime();
    if (elapsed < maxSudoPasswordIntervalInMilli) {
      if (!didShowSudoHint) {
        void (async () => {
          const choice = await vscode.window.showInformationMessage(
            'You can set up sudo to request passwords less frequently.',
            'Open Documentation'
          );
          if (choice) {
            void vscode.env.openExternal(
              vscode.Uri.parse(
                'https://chromium.googlesource.com/chromiumos/docs/+/HEAD/tips-and-tricks.md#how-to-make-sudo-a-little-more-permissive'
              )
            );
          }
        })();
        didShowSudoHint = true;
      }
    }
  }
  lastDidRunSudoWithPassword = now;
}
