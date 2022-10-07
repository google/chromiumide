// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as https from 'https';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import * as gitDocument from '../../services/git_document';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as git from './git';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  _gitDocumentProvider: gitDocument.GitDocumentProvider
) {
  const outputChannel = vscode.window.createOutputChannel('CrOS IDE: Gerrit');
  context.subscriptions.push(outputChannel);
  const SHOW_LOG_CMD = 'cros-ide.showGerritLog';
  context.subscriptions.push(
    vscode.commands.registerCommand(SHOW_LOG_CMD, () => {
      outputChannel.show();
    })
  );
  // We don't use the status itself. The task provides an easy way
  // to find the log.
  statusManager.setTask('Gerrit', {
    status: bgTaskStatus.TaskStatus.OK,
    command: {
      command: SHOW_LOG_CMD,
      title: 'Show Gerrit Log',
    },
  });

  const controller = vscode.comments.createCommentController(
    'cros-ide-gerrit',
    'CrOS IDE Gerrit'
  );

  context.subscriptions.push(controller);

  const gerrit = new Gerrit(controller, outputChannel);

  if (vscode.window.activeTextEditor) {
    const document = vscode.window.activeTextEditor.document;
    void gerrit.showComments(document);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        void gerrit.showComments(editor.document);
      }
    }),
    vscode.workspace.onDidSaveTextDocument(document => {
      void gerrit.showComments(document);
    })
  );
}

class Gerrit {
  constructor(
    private readonly controller: vscode.CommentController,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  async showComments(activeDocument: vscode.TextDocument) {
    const latestCommit: commonUtil.ExecResult | Error = await commonUtil.exec(
      'git',
      ['show', '-s'],
      {cwd: path.dirname(activeDocument.fileName)}
    );
    if (latestCommit instanceof Error) {
      this.showErrorMessage(
        `Failed to detect a commit for ${activeDocument.fileName}`
      );
      return;
    }
    const changeIdRegex = /Change-Id: (I[0-9a-z]*)/;
    const changeIdArray = changeIdRegex.exec(latestCommit.stdout);
    if (!changeIdArray) {
      return;
    }
    // TODO(teramon): Support multiple commits
    const changeId = changeIdArray[1];
    const commentsUrl =
      'https://chromium-review.googlesource.com/changes/' +
      changeId +
      '/comments';

    try {
      const commentsContent = await httpsGet(commentsUrl);
      const commentsJson = commentsContent.substring(')]}\n'.length);
      const originalChangeComments = JSON.parse(commentsJson) as ChangeComments;
      const gitDir = commonUtil.findGitDir(activeDocument.fileName);
      if (!gitDir) {
        this.showErrorMessage('Git directory not found');
        return;
      }
      const changeThreads = partitionThreads(originalChangeComments);
      await shiftChangeComments(gitDir, changeThreads);
      updateCommentThreads(this.controller, changeThreads, gitDir);
    } catch (err) {
      this.showErrorMessage(`Failed to add Gerrit comments: ${err}`);
      return;
    }
  }

  private showErrorMessage(message: string) {
    this.outputChannel.appendLine(message);
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

function partitionCommentArray(comments: CommentInfo[]): Thread[] {
  // Sort the input to make sure we see ids before they are used in in_reply_to.
  comments.sort((c1, c2) => c1.updated.localeCompare(c2.updated));

  const threadIndex = new Map<string, number>();
  const threads: Thread[] = [];

  for (const c of comments) {
    // Idx is undefined for the first comment in a thread,
    // and for a reply to a comment we haven't seen.
    // The second case should not happen.
    let idx = c.in_reply_to ? threadIndex.get(c.in_reply_to) : undefined;
    if (idx !== undefined) {
      threads[idx].push(c);
    } else {
      // push() returns the new length of the modiified array
      idx = threads.push([c]) - 1;
    }
    threadIndex.set(c.id, idx);
  }

  return threads;
}

/**
 * For each filePath break comments in to threads. That is, turn a comment array
 * into an array of arrays, which represent threads
 */
function partitionThreads(changeComments: ChangeComments): ChangeThreads {
  const changeThreads: ChangeThreads = {};
  for (const [filePath, comments] of Object.entries(changeComments)) {
    changeThreads[filePath] = partitionCommentArray(comments);
  }
  return changeThreads;
}

async function shiftChangeComments(
  gitDir: string,
  changeComments: ChangeThreads
): Promise<void> {
  const gitDiff = await commonUtil.exec('git', ['diff', '-U0'], {cwd: gitDir});
  if (gitDiff instanceof Error) {
    void vscode.window.showErrorMessage(
      'Failed to get git diff to reposition Gerrit comments'
      // TODO(teramon): Avoid showing the error message more than once.
    );
    return;
  }
  const hunks = git.getHunk(gitDiff.stdout);
  updateChangeComments(hunks, changeComments);
}

// TODO(teramon): Avoid using global value.
const commentThreads: vscode.CommentThread[] = [];

/**
 * Repositions threads based on the given hunks.
 *
 * Thread position is determined by its first comment,
 * so only the first comment is updated. The updates are in-place.
 */
export function updateChangeComments(
  hunksAllFiles: git.Hunks,
  changeComments: ChangeThreads
) {
  for (const [hunkFilePath, hunksEachFile] of Object.entries(hunksAllFiles)) {
    for (const hunk of hunksEachFile) {
      const hunkEndLine = hunk.originalStartLine + hunk.originalLineSize;
      const hunkDelta = hunk.currentLineSize - hunk.originalLineSize;
      for (const [filePath, threads] of Object.entries(changeComments)) {
        if (filePath === hunkFilePath) {
          threads.forEach(thread => {
            const commentInfo = thread[0];
            if (
              // comment outside the hunk
              commentWithinRange(commentInfo, hunkEndLine, Infinity)
            ) {
              shiftComment(commentInfo, hunkDelta);
            } else if (
              // comment within the hunk
              commentWithinRange(
                commentInfo,
                hunk.originalStartLine,
                hunkEndLine
              )
            ) {
              // Ensure the comment within the hunk still resides in the
              // hunk. If the hunk removes all the lines, the comment will
              // be moved to the line preceding the hunk.
              if (hunkDelta < 0 && commentInfo.line !== undefined) {
                const protrusion =
                  commentInfo.line -
                  (hunk.originalStartLine + hunk.currentLineSize) +
                  1;
                if (protrusion > 0) {
                  shiftComment(commentInfo, -1 * protrusion);
                }
              }
            }
          });
        }
      }
    }
  }
}

/**
 * Returns whether the comment is in the range between
 * minimum (inclusive) and maximum (exclusive).
 */
function commentWithinRange(
  commentInfo: CommentInfo,
  minimum: number,
  maximum: number
): boolean {
  return (
    commentInfo.line !== undefined &&
    commentInfo.line >= minimum &&
    commentInfo.line < maximum
  );
}

function shiftComment(commentInfo: CommentInfo, delta: number) {
  if (
    // Comments for characters
    commentInfo.range !== undefined &&
    commentInfo.line !== undefined
  ) {
    commentInfo.range.start_line += delta;
    commentInfo.range.end_line += delta;
    commentInfo.line += delta;
  } else if (
    // Comments for lines
    commentInfo.line !== undefined
  ) {
    commentInfo.line += delta;
  }
}

function updateCommentThreads(
  controller: vscode.CommentController,
  changeThreads: ChangeThreads,
  gitDir: string
) {
  commentThreads.forEach(commentThread => commentThread.dispose());
  commentThreads.length = 0;
  for (const [filepath, threads] of Object.entries(changeThreads)) {
    threads.forEach(thread => {
      let uri;
      if (filepath !== '/COMMIT_MSG') {
        uri = vscode.Uri.file(path.join(gitDir, filepath));
        commentThreads.push(createCommentThread(controller, thread, uri));
      } else {
        uri = vscode.Uri.from({
          scheme: gitDocument.GIT_MSG_SCHEME,
          path: path.join(gitDir, 'COMMIT MESSAGE'),
          query: 'HEAD',
        });
        // Compensate the difference between commit message on Gerrit and Terminal
        const commentInfo = thread[0];
        if (commentInfo.line !== undefined && commentInfo.line > 6) {
          shiftComment(commentInfo, -6);
        } else if (commentInfo.line !== undefined) {
          shiftComment(commentInfo, -1 * (commentInfo.line - 1));
        }
        commentThreads.push(createCommentThread(controller, thread, uri));
      }
    });
  }
}

type Thread = CommentInfo[];

/**
 * Like ChangeComments, but the comments are partitioned into threads
 * represented as arrays of comments.
 */
export type ChangeThreads = {
  [filePath: string]: Thread[];
};

// TODO(b:216048068): move Gerrit API types to a separate file.

// Response from Gerrit List Change Comments API.
// https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html#list-change-comments
export type ChangeComments = {
  [filePath: string]: CommentInfo[];
};

export type CommentInfo = {
  id: string;
  author: AccountInfo;
  range?: CommentRange;
  // Comments on entire lines have `line` but not `range`.
  line?: number;
  in_reply_to?: string;
  updated: string;
  message: string;
};

export type AccountInfo = {
  name: string;
};

export type CommentRange = {
  start_line: number; // 1-based
  start_character: number; // 0-based
  end_line: number; // 1-based
  end_character: number; // 0-based
};

function toVscodeComment(c: CommentInfo): vscode.Comment {
  return {
    author: {
      name: c.author.name,
    },
    body: c.message,
    mode: vscode.CommentMode.Preview,
  };
}

function createCommentThread(
  controller: vscode.CommentController,
  thread: Thread,
  dataUri: vscode.Uri
): vscode.CommentThread {
  let dataRange;
  const commentInfo = thread[0];
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
  const vscodeThread = controller.createCommentThread(
    dataUri,
    dataRange,
    thread.map(c => toVscodeComment(c))
  );
  vscodeThread.label = 'Gerrit';
  vscodeThread.canReply = false;
  return vscodeThread;
}

export const TEST_ONLY = {
  partitionThreads,
};
