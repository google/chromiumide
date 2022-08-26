// Copyright 2022 The ChromiumOS Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import * as commonUtil from '../../common/common_util';

export function activate(context: vscode.ExtensionContext) {
  const demoCmd = vscode.commands.registerCommand('cros-ide.gerrit', () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      return showGerritComments(activeEditor.document);
    }
  });
  context.subscriptions.push(demoCmd);
}

async function showGerritComments(activeDocument: vscode.TextDocument) {
  const latestCommit: commonUtil.ExecResult | Error = await commonUtil.exec(
    'git',
    ['show', '-s'],
    {cwd: path.dirname(activeDocument.fileName)}
  );
  if (latestCommit instanceof Error) {
    void vscode.window.showErrorMessage(
      'Failed to detect a commit'
      // TODO(teramon): Avoid showing the error message more than once.
    );
    return;
  }
  const changeIdRegex = /Change-Id: (I[0-9a-z]*)/;
  const changeIdArray = changeIdRegex.exec(latestCommit.stdout);
  if (!changeIdArray) {
    return;
  }
  const changeId = changeIdArray[1];
  const commentsUrl =
    'https://chromium-review.googlesource.com/changes/' +
    changeId +
    '/comments';
  const controller = vscode.comments.createCommentController(
    'comment-sample',
    'comment-API-sample'
  );
  try {
    const commentsContent = await httpsGet(commentsUrl);
    const commentsJson = commentsContent.substring(')]}\n'.length);
    const contentJson = JSON.parse(commentsJson) as ChangeComments;
    const gitDir = findGitDir(activeDocument.fileName);
    if (!gitDir) {
      void vscode.window.showErrorMessage(
        'Git directory not found'
        // TODO(teramon): Avoid showing the error message more than once.
      );
      return;
    }
    for (const [filepath, value] of Object.entries(contentJson)) {
      value.forEach(commentInfo => {
        const dataUri = vscode.Uri.file(path.join(gitDir, filepath));
        showCommentInfo(controller, commentInfo, dataUri);
      });
      console.log(value);
    }
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Failed to add Gerrit comments: ${err}`
      // TODO(teramon): Avoid showing the error message more than once.
    );
    return;
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
  line: number;
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
  commentInfo: CommentInfo,
  dataUri: vscode.Uri
) {
  let dataRange;
  if (commentInfo.range !== undefined) {
    dataRange = new vscode.Range(
      commentInfo.range.start_line - 1,
      commentInfo.range.start_character,
      commentInfo.range.end_line - 1,
      commentInfo.range.end_character
    );
  } else if (commentInfo.line !== undefined) {
    // comments for a line
    dataRange = new vscode.Range(
      commentInfo.line - 1,
      0,
      commentInfo.line - 1,
      0
    );
  } else {
    // comments for the entire file
    dataRange = new vscode.Range(0, 0, 0, 0);
  }
  const newComment: vscode.Comment[] = [
    {
      author: {
        name: commentInfo.author.name,
      },
      body: commentInfo.message,
      mode: vscode.CommentMode.Preview,
    },
  ];
  controller.createCommentThread(dataUri, dataRange, newComment);
}

function findGitDir(filePath: string): string | undefined {
  let parent: string = path.dirname(filePath);
  while (!fs.existsSync(path.join(parent, '.git'))) {
    const grandParent = path.dirname(parent);
    if (grandParent === parent) {
      return undefined;
    }
    parent = path.dirname(parent);
  }
  return parent;
}
