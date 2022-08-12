// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as https from 'https';

export function activate(context: vscode.ExtensionContext) {
  void vscode.window.showInformationMessage('Hello GerritIntegration!!');

  const demoCmd = vscode.commands.registerCommand(
    'cros-ide.gerrit',
    showGerritComments
  );
  context.subscriptions.push(demoCmd);
}

async function showGerritComments() {
  // TODO(teramon): Construct the URL parsing Git commit
  const commentsUrl =
    'https://chromium-review.googlesource.com/changes/Ifbd244655871bbed11f4aa9c18f195502a691704/comments';
  try {
    const commentsContent = await httpsGet(commentsUrl);
    const commentsJson = commentsContent.substring(')]}\n'.length);
    const contentJson = JSON.parse(commentsJson);
    void vscode.window.showInformationMessage(contentJson);
    const debugJson = JSON.stringify(contentJson, null, 2);
    console.log(debugJson);
    // TODO(teramon): Show the comments on editor.
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Failed to add Gerrit comments: ${err}`
    );
    // TODO(teramon): Avoid showing the error message more than once.
  }
}

async function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`status code: ${res.statusCode}`));
        }
        const body: Uint8Array[] = [];
        res.on('data', data => body.push(data));
        res.on('end', () => {
          resolve(Buffer.concat(body).toString());
        });
      })
      .on('error', reject);
  });
}
