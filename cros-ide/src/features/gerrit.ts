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
  const controller = vscode.comments.createCommentController(
    'comment-sample',
    'comment-API-sample'
  );
  try {
    const commentsContent = await httpsGet(commentsUrl);
    const commentsJson = commentsContent.substring(')]}\n'.length);
    const contentJson = JSON.parse(commentsJson) as ChangeComments;
    for (const [key, value] of Object.entries(contentJson)) {
      contentJson[key].forEach(msg => {
        showCommentInfo(controller, msg);
      });
      console.log(value);
    }
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Failed to add Gerrit comments: ${err}`
      // TODO(teramon): Avoid showing the error message more than once.
    );
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

// Response from Gerrit List Change Comments API.
// https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html#list-change-comments
type ChangeComments = {
  [filepath: string]: CommentInfo[];
};

type CommentInfo = {
  author: AccountInfo;
  range: CommentRange;
  message: string;
};

type AccountInfo = {
  name: string;
};

type CommentRange = {
  start_line: number; // 1-based
  start_character: number; // 0-based
  end_line: number; // 1-based
  end_character: number; // 0-based
};

function showCommentInfo(
  controller: vscode.CommentController,
  commentInfo: CommentInfo
) {
  const dataRange = new vscode.Range(
    commentInfo.range.start_line - 1,
    commentInfo.range.start_character,
    commentInfo.range.end_line - 1,
    commentInfo.range.end_character
  );
  const newComment: vscode.Comment[] = [
    {
      author: {
        name: commentInfo.author.name,
      },
      body: commentInfo.message,
      mode: vscode.CommentMode.Preview,
    },
  ];
  const dataUri = vscode.window.activeTextEditor?.document.uri;
  controller.createCommentThread(dataUri!, dataRange, newComment);
}
