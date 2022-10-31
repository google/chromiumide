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

// Task name in the status manager.
const GERRIT = 'Gerrit';

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
      metrics.send({
        category: 'interactive',
        group: 'idestatus',
        action: 'show gerrit log',
      });
    })
  );
  // We don't use the status itself. The task provides an easy way
  // to find the log.
  statusManager.setTask(GERRIT, {
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

  const gerrit = new Gerrit(
    controller,
    outputChannel,
    statusBar,
    statusManager
  );

  let gitHead: string | undefined;

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      void gerrit.showComments(document.fileName, {noFetch: true});
    }),
    vscode.commands.registerCommand(
      'cros-ide.gerrit.collapseAllComments',
      () => {
        // See https://github.com/microsoft/vscode/issues/158316 to learn more.
        //
        // TODO(b:255468946): Clean-up this method when the upstream API stabilizes.
        //   1. Use updated CommentThread JS API if it is updated.
        //   2. Do not change the collapsibleState.
        //   3. Collapse all comments, not just those in the active text editor.
        void vscode.commands.executeCommand(
          // Collapses all comments in the active text editor.
          'workbench.action.collapseAllComments'
        );
        gerrit.collapseAllComments();
        metrics.send({
          category: 'interactive',
          group: 'gerrit',
          action: 'collapse all comments',
        });
      }
    ),
    gitDirsWatcher.onDidChangeHead(async event => {
      // 1. Check !event.head to avoid closing comments
      //    when the only visible file is closed or replaced.
      // 2. Check event.head !== gitHead to avoid reloading comments
      //    on "head_1 -> undefined -> head_1" sequence.
      if (event.head && event.head !== gitHead) {
        gitHead = event.head;
        await gerrit.showComments(event.gitDir);
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
    private readonly statusBar: vscode.StatusBarItem,
    private readonly statusManager: bgTaskStatus.StatusManager
  ) {}

  /** Generator for iterating over all Threads. */
  *threads(): Generator<Thread> {
    if (this.partitionedThreads) {
      for (const [, changeThreads] of this.partitionedThreads) {
        for (const [, threads] of Object.entries(changeThreads)) {
          for (const thread of threads) {
            yield thread;
          }
        }
      }
    }
  }

  /**
   * Fetches comments on changes in the Git repo which contains `path`
   * (file or directory) and shows them with
   * proper repositioning based on the local diff. It caches the response
   * from Gerrit and uses it unless opts.fetch is true.
   */
  async showComments(path: string, opts?: {noFetch: boolean}) {
    try {
      const gitDir = commonUtil.findGitDir(path);
      if (!gitDir) {
        this.showErrorMessage('Git directory not found');
        return;
      }

      const doFetch = !opts?.noFetch;
      if (doFetch) {
        await this.fetchComments(gitDir);
        this.clearCommentThreads();
      }
      if (!this.partitionedThreads) {
        return;
      }

      for (const [originalCommitId, changeThreads] of this.partitionedThreads) {
        // TODO(b:216048068): Handle original commit not available locally.
        await this.shiftChangeComments(gitDir, originalCommitId, changeThreads);
        this.displayCommentThreads(this.controller, changeThreads, gitDir);
      }
      this.updateStatusBar();
      this.statusManager.setStatus(GERRIT, bgTaskStatus.TaskStatus.OK);
      if (doFetch) {
        this.sendMetrics();
      }
    } catch (err) {
      this.showErrorMessage({
        log: `Failed to add Gerrit comments: ${err}`,
        metrics: 'Failed to add Gerrit comments (top-level error)',
      });
      return;
    }
  }

  collapseAllComments() {
    for (const thread of this.commentThreads) {
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
    }
  }

  updateStatusBar() {
    let total = 0;
    let unresolved = 0;
    for (const thread of this.threads()) {
      total++;
      if (thread.unresolved) {
        unresolved++;
      }
    }
    if (total > 0) {
      this.statusBar.text = `$(comment) ${unresolved}`;
      this.statusBar.tooltip = `Gerrit comments: ${unresolved} unresolved (${total} total)`;
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
   * to partition it into threads and by commit id. The data is then
   * stored in `this.partitionedThreads`.
   */
  private async fetchComments(gitDir: string) {
    const gitLogInfos = await git.readChangeIds(gitDir, this.outputChannel);
    if (gitLogInfos instanceof Error) {
      this.showErrorMessage({
        log: `Failed to detect commits in ${gitDir}`,
        metrics: 'FetchComments failed to detect commits',
      });
      return undefined;
    }
    if (gitLogInfos.length === 0) {
      return undefined;
    }

    const partitionedThreads: [string, ChangeThreads][] = [];

    for (const gitLogInfo of gitLogInfos) {
      const gerritChangeId = gitLogInfo.gerritChangeId;
      const commentsUrl = `https://chromium-review.googlesource.com/changes/${gerritChangeId}/comments`;
      const commentsContent = await https.getOrThrow(commentsUrl);
      if (!commentsContent) {
        this.outputChannel.appendLine(`Not found on Gerrit: ${gerritChangeId}`);
        continue;
      }
      const commentsJson = commentsContent.substring(')]}\n'.length);
      const changeComments = JSON.parse(commentsJson) as api.ChangeComments;
      const combinedChangeThreads = partitionThreads(
        changeComments,
        gitLogInfo
      );
      for (const item of partitionByCommitId(combinedChangeThreads)) {
        partitionedThreads.push(item);
      }
    }

    this.partitionedThreads = partitionedThreads;
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
    // If the local branch is rebased after uploading it for review,
    // unrestricted `git diff` will include everything that changed
    // in the entire repo. This can have performance implications.
    const relevantFiles = Object.getOwnPropertyNames(changeThreads).filter(
      path => !api.MAGIC_PATHS.includes(path)
    );
    const hunks = await git.readDiffHunks(
      gitDir,
      originalCommitId,
      relevantFiles,
      this.outputChannel
    );
    if (hunks instanceof Error) {
      this.showErrorMessage(
        'Failed to get git diff to reposition Gerrit comments'
      );
      return;
    }
    updateChangeComments(hunks, changeThreads);
  }

  /**
   * Show `message.log` in the IDE, set task status to error,
   * and send `message.metrics` via metrics if it is set.
   *
   * If `message` is a string, it is used both in the log and metrics.
   */
  private showErrorMessage(message: string | {log: string; metrics?: string}) {
    const m: {log: string; metrics?: string} =
      typeof message === 'string' ? {log: message, metrics: message} : message;

    this.outputChannel.appendLine(m.log);
    this.statusManager.setStatus(GERRIT, bgTaskStatus.TaskStatus.ERROR);
    if (m.metrics) {
      metrics.send({
        category: 'error',
        group: 'gerrit',
        description: m.metrics,
      });
    }
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
          uri = gitDocument.commitMessageUri(
            gitDir,
            thread.gitLogInfo.gitSha,
            'gerrit commit msg'
          );
          // Compensate the difference between commit message on Gerrit and Terminal
          if (thread.originalLine !== undefined && thread.originalLine > 6) {
            thread.shift -= 6;
          } else if (thread.originalLine !== undefined) {
            thread.shift -= thread.originalLine - 1;
          }
        } else if (filepath === '/PATCHSET_LEVEL') {
          uri = virtualDocument.patchSetUri(
            gitDir,
            thread.gitLogInfo.gerritChangeId
          );
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
  apiComments: readonly api.CommentInfo[],
  gitLogInfo: git.GitLogInfo
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
      idx = threads.push(new Thread([c], gitLogInfo)) - 1;
    }
    threadIndex.set(c.id, idx);
  }

  return threads;
}

/**
 * For each filePath break comments in to threads. That is, turn a comment array
 * into an array of arrays, which represent threads
 */
function partitionThreads(
  changeComments: api.ChangeComments,
  gitLogInfo: git.GitLogInfo
): ChangeThreads {
  const changeThreads: ChangeThreads = {};
  for (const [filePath, comments] of Object.entries(changeComments)) {
    changeThreads[filePath] = partitionCommentArray(comments, gitLogInfo);
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
      thread.shift = 0;
      for (const hunk of hunks) {
        if (threadFollowsHunk(thread, hunk)) {
          // comment outside the hunk
          thread.shift += hunk.sizeDelta;
        } else if (
          // comment within the hunk
          threadWithinRange(thread, hunk.originalStart, hunk.originalEnd)
        ) {
          // Ensure the comment within the hunk still resides in the
          // hunk. If the hunk removes all the lines, the comment will
          // be moved to the line preceding the hunk.
          if (hunk.sizeDelta < 0 && thread.originalLine !== undefined) {
            const protrusion =
              thread.originalLine - (hunk.originalStart + hunk.currentSize) + 1;
            if (protrusion > 0) {
              thread.shift -= protrusion;
            }
          }
        }
      }
    }
  }
}

/**
 * True if a thread starts after the hunk ends. Such threads should be moved
 * by the size change introduced by the hunk.
 */
function threadFollowsHunk(thread: Thread, hunk: git.Hunk) {
  if (!thread.originalLine) {
    return false;
  }

  // Case 1: hunks that insert lines.
  // The original side is `N,0` and the hunk inserts lines between N and N+1.
  if (hunk.originalSize === 0) {
    return thread.originalLine > hunk.originalStart;
  }

  // Case 2: Modifications and deletions.
  // The original side is `N,size` and the hunk modifies 'size' lines starting from N.
  return thread.originalLine >= hunk.originalStart + hunk.originalSize;
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
    thread.originalLine !== undefined &&
    thread.originalLine >= minimum &&
    thread.originalLine < maximum
  );
}

export class Thread {
  /**
   * Update required to reposition the thread from the original location
   * to the corresponding line in the working tree. Only lines are shifted,
   * columns are ignored.
   */
  shift = 0;

  vscodeThread?: vscode.CommentThread;

  constructor(
    readonly comments: api.CommentInfo[],
    readonly gitLogInfo: git.GitLogInfo
  ) {}

  get originalLine() {
    return this.comments[0].line;
  }

  /** Shifted line. */
  get line() {
    if (!this.originalLine) {
      return undefined;
    }
    return this.originalLine + this.shift;
  }

  /** Shifted range. */
  get range() {
    const r = this.comments[0].range!;
    if (!r) {
      return undefined;
    }
    return {
      start_line: r.start_line + this.shift,
      start_character: r.start_character,
      end_line: r.end_line + this.shift,
      end_character: r.end_character,
    };
  }

  commitId(): string {
    // TODO(b:216048068): make sure we have the commit_id
    return this.comments[0].commit_id!;
  }

  /** A thread is unresolved if its last comment is unresolved. */
  get unresolved() {
    // Unresolved can be undefined according the the API documentation,
    // but Gerrit always sent it on the changes the we inspected.
    return this.comments[this.comments.length - 1].unresolved;
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
  const range = thread.range;
  if (range !== undefined) {
    // VSCode is 0-base, whereas Gerrit has 1-based lines and 0-based columns.
    return new vscode.Range(
      range.start_line - 1,
      range.start_character,
      range.end_line - 1,
      range.end_character
    );
  }

  // comments for a line
  const line = thread.line;
  if (line !== undefined) {
    return new vscode.Range(line - 1, 0, line - 1, 0);
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
  if (thread.unresolved) {
    vscodeThread.label = 'Unresolved';
    vscodeThread.collapsibleState =
      vscode.CommentThreadCollapsibleState.Expanded;
  } else {
    vscodeThread.label = 'Resolved';
  }
  vscodeThread.canReply = false;
  return vscodeThread;
}

export const TEST_ONLY = {
  formatGerritTimestamp,
  Gerrit,
  partitionThreads,
};
