// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import * as commonUtil from '../../common/common_util';
import * as git from './git';

export function activate(context: vscode.ExtensionContext) {
  const controller = vscode.comments.createCommentController(
    'cros-ide-gerrit',
    'CrOS IDE Gerrit'
  );
  context.subscriptions.push(controller);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        void showGerritComments(editor.document, controller);
      }
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      void showGerritComments(document, controller);
    })
  );
}

async function showGerritComments(
  activeDocument: vscode.TextDocument,
  controller: vscode.CommentController
) {
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

  try {
    const commentsContent = await httpsGet(commentsUrl);
    const commentsJson = commentsContent.substring(')]}\n'.length);
    const originalChangeComments = JSON.parse(commentsJson) as ChangeComments;
    const gitDir = findGitDir(activeDocument.fileName);
    if (!gitDir) {
      void vscode.window.showErrorMessage(
        'Git directory not found'
        // TODO(teramon): Avoid showing the error message more than once.
      );
      return;
    }
    const shiftedChangeComments = await shiftChangeComments(
      gitDir,
      originalChangeComments
    );
    updateCommentThreads(controller, shiftedChangeComments, gitDir);
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

async function shiftChangeComments(
  gitDir: string,
  changeComments: ChangeComments
): Promise<ChangeComments> {
  const gitDiff = await commonUtil.exec('git', ['diff', '-U0'], {cwd: gitDir});
  if (gitDiff instanceof Error) {
    void vscode.window.showErrorMessage(
      'Failed to get git diff to reposition Gerrit comments'
      // TODO(teramon): Avoid showing the error message more than once.
    );
    return changeComments;
  }
  const hunks = git.getHunk(gitDiff.stdout);
  return updateChangeComments(hunks, changeComments);
}

// TODO(teramon): Avoid using global value.
const commentThreads: vscode.CommentThread[] = [];

function updateChangeComments(
  hunks: git.Hunk[],
  changeComments: ChangeComments
): ChangeComments {
  // TODO(teramon): Add a process to reposition comments
  return changeComments;
}

function updateCommentThreads(
  controller: vscode.CommentController,
  changeComments: ChangeComments,
  gitDir: string
) {
  commentThreads.forEach(commentThread => commentThread.dispose());
  commentThreads.length = 0;
  for (const [filepath, value] of Object.entries(changeComments)) {
    value.forEach(commentInfo => {
      const dataUri = vscode.Uri.file(path.join(gitDir, filepath));
      commentThreads.push(showCommentInfo(controller, commentInfo, dataUri));
    });
  }
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
): vscode.CommentThread {
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
  return controller.createCommentThread(dataUri, dataRange, newComment);
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
