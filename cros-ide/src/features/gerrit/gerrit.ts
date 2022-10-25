// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as dateFns from 'date-fns';
import * as commonUtil from '../../common/common_util';
import * as services from '../../services';
import * as gitDocument from '../../services/git_document';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as metrics from '../metrics/metrics';
import * as api from './api';
import * as git from './git';
import * as helpers from './helpers';
import * as https from './https';
import * as virtualDocument from './virtual_document';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  _gitDocumentProvider: gitDocument.GitDocumentProvider,
  gitDirsWatcher: services.GitDirsWatcher
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

  new virtualDocument.GerritDocumentProvider().activate(context);

  const controller = vscode.comments.createCommentController(
    'cros-ide-gerrit',
    'CrOS IDE Gerrit'
  );

  context.subscriptions.push(controller);

  const focusCommentsPanel = 'cros-ide.gerrit.focusCommentsPanel';
  context.subscriptions.push(
    vscode.commands.registerCommand(focusCommentsPanel, () => {
      void vscode.commands.executeCommand(
        'workbench.action.focusCommentsPanel'
      );
      metrics.send({
        category: 'interactive',
        group: 'gerrit',
        action: 'focus comments panel',
      });
    })
  );
  context.subscriptions;
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10 // puts this item left of clangd
  );
  statusBar.command = focusCommentsPanel;

  const gerrit = new Gerrit(controller, outputChannel, statusBar);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      void gerrit.showComments(document.fileName, {noFetch: true});
    }),
    vscode.commands.registerCommand(
      'cros-ide.gerrit.collapseAllComments',
      () => {
        gerrit.collapseAllComments();
        metrics.send({
          category: 'interactive',
          group: 'gerrit',
          action: 'collapse all comments',
        });
      }
    ),
    gitDirsWatcher.onDidChangeHead(async event => {
      if (event.head) {
        // TODO(b:216048068): Clean up the hack with placeholder file name.
        await gerrit.showComments(path.join(event.gitDir, 'placeholder.cc'));
      } else {
        gerrit.clearCommentThreads();
        gerrit.updateStatusBar();
      }
    })
  );
}

class Gerrit {
  // list of [commit id, threads] pairs
  private partitionedThreads?: [string, ChangeThreads][];
  private commentThreads: vscode.CommentThread[] = [];

  constructor(
    private readonly controller: vscode.CommentController,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly statusBar: vscode.StatusBarItem
  ) {}

  /**
   * Fetches comments given to the file and shows them with
   * proper repositioning based on the local diff. It caches the response
   * from Gerrit and uses it unless opts.fetch is true.
   */
  async showComments(fileName: string, opts?: {noFetch: boolean}) {
    try {
      const doFetch = !opts?.noFetch;
      if (doFetch) {
        this.partitionedThreads = await this.fetchComments(fileName);
        this.clearCommentThreads();
      }
      if (!this.partitionedThreads) {
        return;
      }

      const gitDir = commonUtil.findGitDir(fileName);
      if (!gitDir) {
        this.showErrorMessage('Git directory not found');
        return;
      }

      for (const [originalCommitId, changeThreads] of this.partitionedThreads) {
        for (const [, threads] of Object.entries(changeThreads)) {
          for (const thread of threads) {
            thread.initializeLocation();
          }
        }

        // TODO(b:216048068): Handle original commit not available locally.
        await this.shiftChangeComments(gitDir, originalCommitId, changeThreads);
        this.displayCommentThreads(this.controller, changeThreads, gitDir);
      }
      this.updateStatusBar();
      if (doFetch) {
        this.sendMetrics();
      }
    } catch (err) {
      this.showErrorMessage(`Failed to add Gerrit comments: ${err}`);
      return;
    }
  }

  collapseAllComments() {
    for (const thread of this.commentThreads) {
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
    }
  }

  updateStatusBar() {
    const nThreads = this.commentThreads.length;
    if (nThreads > 0) {
      // TODO(b:216048068): show number of unresolved comments rather than the total
      this.statusBar.text = `$(comment) ${nThreads}`;
      this.statusBar.tooltip =
        nThreads > 1 ? `${nThreads} Gerrit comments` : '1 Gerrit comment';
      this.statusBar.show();
    } else {
      this.statusBar.hide();
    }
  }

  sendMetrics() {
    metrics.send({
      category: 'background',
      group: 'gerrit',
      action: 'update comments',
      value: this.commentThreads.length,
    });
  }

  /**
   * Retrieves data from Gerrit API and applies basic transformations
   * to partition it into threads and by commit id.
   */
  private async fetchComments(fileName: string) {
    const changeIds = await git.readChangeIds(path.dirname(fileName));
    if (changeIds instanceof Error) {
      this.showErrorMessage(`Failed to detect a commits for ${fileName}`);
      return undefined;
    }
    if (changeIds.length === 0) {
      return undefined;
    }

    // TODO(teramon): Support multiple commits
    const commentsUrl = `https://chromium-review.googlesource.com/changes/${changeIds[0]}/comments`;

    const commentsContent = await https.get(commentsUrl);
    const commentsJson = commentsContent.substring(')]}\n'.length);
    const changeComments = JSON.parse(commentsJson) as api.ChangeComments;
    const combinedChangeThreads = partitionThreads(changeComments);
    return partitionByCommitId(combinedChangeThreads);
  }

  /**
   * Updates line numbers in `changeThreads`, which are assumed to be made
   * on the `originalCommitId`, so they can be placed in the right lines on the files
   * in the working tree.
   */
  async shiftChangeComments(
    gitDir: string,
    originalCommitId: string,
    changeThreads: ChangeThreads
  ): Promise<void> {
    const hunks = await git.readDiffHunks(gitDir, originalCommitId);
    if (hunks instanceof Error) {
      this.showErrorMessage(
        'Failed to get git diff to reposition Gerrit comments'
      );
      return;
    }
    updateChangeComments(hunks, changeThreads);
  }

  private showErrorMessage(message: string) {
    this.outputChannel.appendLine(message);
  }

  clearCommentThreads() {
    this.commentThreads.forEach(commentThread => commentThread.dispose());
    this.commentThreads.length = 0;
  }

  private displayCommentThreads(
    controller: vscode.CommentController,
    changeThreads: ChangeThreads,
    gitDir: string
  ) {
    for (const [filepath, threads] of Object.entries(changeThreads)) {
      threads.forEach(thread => {
        let uri;
        if (filepath === '/COMMIT_MSG') {
          uri = gitDocument.commitMessageUri(gitDir, 'HEAD');
          // Compensate the difference between commit message on Gerrit and Terminal
          if (thread.line !== undefined && thread.line > 6) {
            shiftThread(thread, -6);
          } else if (thread.line !== undefined) {
            shiftThread(thread, -1 * (thread.line - 1));
          }
        } else if (filepath === '/PATCHSET_LEVEL') {
          uri = virtualDocument.patchSetUri(gitDir);
        } else {
          uri = vscode.Uri.file(path.join(gitDir, filepath));
        }
        const vscodeThread = thread.display(controller, uri);
        if (vscodeThread) {
          this.commentThreads.push(vscodeThread);
        }
      });
    }
  }
}

function partitionCommentArray(
  apiComments: readonly api.CommentInfo[]
): Thread[] {
  // Copy the input to avoid modifying data received from Gerrit API.
  const comments = [...apiComments];

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
      threads[idx].comments.push(c);
    } else {
      // push() returns the new length of the modiified array
      idx = threads.push(new Thread([c])) - 1;
    }
    threadIndex.set(c.id, idx);
  }

  return threads;
}

/**
 * For each filePath break comments in to threads. That is, turn a comment array
 * into an array of arrays, which represent threads
 */
function partitionThreads(changeComments: api.ChangeComments): ChangeThreads {
  const changeThreads: ChangeThreads = {};
  for (const [filePath, comments] of Object.entries(changeComments)) {
    changeThreads[filePath] = partitionCommentArray(comments);
  }
  return changeThreads;
}

function partitionByCommitId(
  changeThread: ChangeThreads
): [string, ChangeThreads][] {
  return helpers.splitPathMap(changeThread, (thread: Thread) =>
    thread.commitId()
  );
}

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
  for (const [filePath, threads] of Object.entries(changeComments)) {
    const hunks = hunksAllFiles[filePath] || [];
    for (const thread of threads) {
      let cumulativeShift = 0;
      for (const hunk of hunks) {
        if (threadFollowsHunk(thread, hunk)) {
          // comment outside the hunk
          cumulativeShift += hunk.sizeDelta;
        } else if (
          // comment within the hunk
          threadWithinRange(thread, hunk.originalStart, hunk.originalEnd)
        ) {
          // Ensure the comment within the hunk still resides in the
          // hunk. If the hunk removes all the lines, the comment will
          // be moved to the line preceding the hunk.
          if (hunk.sizeDelta < 0 && thread.line !== undefined) {
            const protrusion =
              thread.line - (hunk.originalStart + hunk.currentSize) + 1;
            if (protrusion > 0) {
              cumulativeShift += -1 * protrusion;
            }
          }
        }
      }
      shiftThread(thread, cumulativeShift);
    }
  }
}

/**
 * True if a thread starts after the hunk ends. Such threads should be moved
 * by the size change introduced by the hunk.
 */
function threadFollowsHunk(thread: Thread, hunk: git.Hunk) {
  if (!thread.line) {
    return false;
  }

  // Case 1: hunks that insert lines.
  // The original side is `N,0` and the hunk inserts lines between N and N+1.
  if (hunk.originalSize === 0) {
    return thread.line > hunk.originalStart;
  }

  // Case 2: Modifications and deletions.
  // The original side is `N,size` and the hunk modifies 'size' lines starting from N.
  return thread.line >= hunk.originalStart + hunk.originalSize;
}

/**
 * Returns whether the comment is in the range between
 * minimum (inclusive) and maximum (exclusive).
 */
function threadWithinRange(
  thread: Thread,
  minimum: number,
  maximum: number
): boolean {
  return (
    thread.line !== undefined && thread.line >= minimum && thread.line < maximum
  );
}

function shiftThread(thread: Thread, delta: number) {
  if (
    // Comments for characters
    thread.range !== undefined &&
    thread.line !== undefined
  ) {
    thread.range.start_line += delta;
    thread.range.end_line += delta;
    thread.line += delta;
  } else if (
    // Comments for lines
    thread.line !== undefined
  ) {
    thread.line += delta;
  }
}

export class Thread {
  /** Copy of comments[0].line to be used during repositioning. */
  line?: number;

  /** Copy of comments[0].range to be used during repositioning. */
  range?: {
    start_line: number;
    start_character: number;
    end_line: number;
    end_character: number;
  };

  vscodeThread?: vscode.CommentThread;

  constructor(readonly comments: api.CommentInfo[]) {}

  /** Copy location from first comment into the thread. */
  // TODO(b:216048068): try to remove this method from the public api of this class.
  initializeLocation() {
    this.line = this.comments[0].line;
    if (this.comments[0].range) {
      this.range = {
        start_line: this.comments[0].range.start_line,
        start_character: this.comments[0].range.start_character,
        end_line: this.comments[0].range.end_line,
        end_character: this.comments[0].range.end_character,
      };
    } else {
      this.range = undefined;
    }
  }

  commitId(): string {
    // TODO(b:216048068): make sure we have the commit_id
    return this.comments[0].commit_id!;
  }

  lastComment(): api.CommentInfo {
    return this.comments[this.comments.length - 1];
  }

  /** Shows the thread in the UI and returns vscode.CommentThread, if it was created. */
  display(
    controller: vscode.CommentController,
    dataUri: vscode.Uri
  ): vscode.CommentThread | undefined {
    if (this.vscodeThread) {
      this.vscodeThread.range = getVscodeRange(this);
      return undefined;
    }
    this.vscodeThread = createCommentThread(controller, this, dataUri);
    return this.vscodeThread;
  }
}

/**
 * Like ChangeComments, but the comments are partitioned into threads
 * represented as arrays of comments.
 */
export type ChangeThreads = {
  [filePath: string]: Thread[];
};

/**
 * Convert UTC timestamp returned by Gerrit into a localized human fiendly format.
 *
 * Sample input: '2022-09-27 09:25:04.000000000'
 */
function formatGerritTimestamp(timestamp: string) {
  try {
    // The input is UTC, but before we can parse it, we need to adjust
    // the format by replacing '.000000000' at the end with 'Z'
    // ('Z' tells date-fns that it's UTC time).
    const timestampZ: string = timestamp.replace(/\.[0-9]*$/, 'Z');
    const date: Date = dateFns.parse(
      timestampZ,
      'yyyy-MM-dd HH:mm:ssX',
      new Date()
    );
    // Date-fns functions use the local timezone.
    if (dateFns.isToday(date)) {
      return dateFns.format(date, 'HH:mm'); // e.g., 14:27
    } else if (dateFns.isThisYear(date)) {
      return dateFns.format(date, 'MMM d'); // e.g., Sep 5
    } else {
      return dateFns.format(date, 'yyyy MMM d'); // e.g., 2019 Aug 15
    }
  } catch (err) {
    // Make sure not to throw any errors, because then
    // the comments may not be shown at all.
    return timestamp;
  }
}

function toVscodeComment(c: api.CommentInfo): vscode.Comment {
  return {
    author: {
      name: c.author.name,
    },
    label: formatGerritTimestamp(c.updated),
    body: c.message,
    mode: vscode.CommentMode.Preview,
  };
}

function getVscodeRange(thread: Thread): vscode.Range {
  if (thread.range !== undefined) {
    return new vscode.Range(
      thread.range.start_line - 1,
      thread.range.start_character,
      thread.range.end_line - 1,
      thread.range.end_character
    );
  }

  // comments for a line
  if (thread.line !== undefined) {
    return new vscode.Range(thread.line - 1, 0, thread.line - 1, 0);
  }

  // comments for the entire file
  return new vscode.Range(0, 0, 0, 0);
}

function createCommentThread(
  controller: vscode.CommentController,
  thread: Thread,
  dataUri: vscode.Uri
): vscode.CommentThread {
  const vscodeThread = controller.createCommentThread(
    dataUri,
    getVscodeRange(thread),
    thread.comments.map(c => toVscodeComment(c))
  );
  // TODO(b:216048068): We should indicate resolved/unresolved with UI style.
  const unresolved = thread.lastComment().unresolved;
  // Unresolved can be undefined according the the API documentation,
  // but Gerrit always sent it on the changes the we inspected.
  vscodeThread.label = unresolved ? 'Unresolved' : 'Resolved';
  if (unresolved) {
    vscodeThread.collapsibleState =
      vscode.CommentThreadCollapsibleState.Expanded;
  }
  vscodeThread.canReply = false;
  return vscodeThread;
}

export const TEST_ONLY = {
  formatGerritTimestamp,
  Gerrit,
  partitionThreads,
};
