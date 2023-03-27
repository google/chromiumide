// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {JobManager} from '../../common/common_util';
import * as services from '../../services';
import {underDevelopment} from '../../services/config';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as metrics from '../metrics/metrics';
import * as api from './api';
import * as auth from './auth';
import {
  Change,
  CommentThread,
  VscodeComment,
  VscodeCommentThread,
} from './data';
import * as git from './git';
import * as helpers from './helpers';
import {GerritComments} from './model';
import {Sink} from './sink';
import * as virtualDocument from './virtual_document';

const onDidHandleEventForTestingEmitter = new vscode.EventEmitter<void>();
// Notifies completion of async event handling for testing.
export const onDidHandleEventForTesting =
  onDidHandleEventForTestingEmitter.event;

export function activate(
  statusManager: bgTaskStatus.StatusManager,
  gitDirsWatcher: services.GitDirsWatcher,
  subscriptions?: vscode.Disposable[],
  preEventHandleForTesting?: () => Promise<void>
): vscode.Disposable {
  if (!subscriptions) {
    subscriptions = [];
  }

  const sink = new Sink(statusManager, subscriptions);

  subscriptions.push(new virtualDocument.GerritDocumentProvider());

  if (underDevelopment.gerrit) {
    // Test auth for Gerrit
    subscriptions.push(
      vscode.commands.registerCommand(
        'cros-ide.gerrit.internal.testAuth',
        async () => {
          const authCookie = await auth.readAuthCookie('cros-internal', sink);
          // Fetch from some internal Gerrit change
          const out = await api.fetchOrThrow(
            'cros-internal',
            'changes/I6743130cd3a84635a66f54f81fa839060f3fcb39/comments',
            authCookie
          );
          sink.appendLine(
            '[Internal] Output for the Gerrit auth test:\n' + out
          );
          // Judge that the auth has succeeded if the output is a valid JSON
          void vscode.window.showInformationMessage(
            out && JSON.parse(out) ? 'Auth succeeded!' : 'Auth failed!'
          );
        }
      )
    );
  }

  const focusCommentsPanel = 'cros-ide.gerrit.focusCommentsPanel';
  subscriptions.push(
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
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10 // puts this item left of clangd
  );
  statusBar.command = focusCommentsPanel;

  const gerrit = new Gerrit(
    sink,
    statusBar,
    gitDirsWatcher,
    preEventHandleForTesting
  );
  subscriptions.push(gerrit);

  const jobManager = new JobManager<void>();

  subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async document => {
      // Avoid performing many git operations concurrently.
      await jobManager.offer(() => gerrit.showChanges(document.fileName));
      onDidHandleEventForTestingEmitter.fire();
    }),
    vscode.commands.registerCommand(
      'cros-ide.gerrit.collapseAllCommentThreads',
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
        gerrit.collapseAllCommentThreadsInVscode();
        metrics.send({
          category: 'interactive',
          group: 'gerrit',
          action: 'collapse all comment threads',
        });
      }
    ),
    // TODO(b/268655627): Instrument this command to send metrics.
    vscode.commands.registerCommand(
      'cros-ide.gerrit.browseCommentThread',
      async ({
        gerritCommentThread: {
          changeNumber,
          firstComment: {commentId},
          repoId,
        },
      }: VscodeCommentThread) =>
        openExternal(repoId, `c/${changeNumber}/comment/${commentId}`)
    ),
    // TODO(b/268655627): Instrument this command to send metrics.
    vscode.commands.registerCommand(
      'cros-ide.gerrit.browseCommentThreadAuthor',
      async ({
        gerritCommentThread: {
          firstComment: {authorId},
          repoId,
        },
      }: VscodeCommentThread) => openExternal(repoId, `dashboard/${authorId}`)
    ),
    // TODO(b/268655627): Instrument this command to send metrics.
    vscode.commands.registerCommand(
      'cros-ide.gerrit.browseComment',
      async ({
        gerritComment: {changeNumber, commentId, repoId},
      }: VscodeComment) =>
        openExternal(repoId, `c/${changeNumber}/comment/${commentId}`)
    ),
    // TODO(b/268655627): Instrument this command to send metrics.
    vscode.commands.registerCommand(
      'cros-ide.gerrit.browseCommentAuthor',
      async ({gerritComment: {authorId, repoId}}: VscodeComment) =>
        openExternal(repoId, `dashboard/${authorId}`)
    )
  );

  return vscode.Disposable.from(...[...subscriptions].reverse());
}

async function openExternal(repoId: git.RepoId, path: string): Promise<void> {
  const url = `${git.gerritUrl(repoId)}/${path}`;
  void vscode.env.openExternal(vscode.Uri.parse(url));
}

class Gerrit implements vscode.Disposable {
  // Map git root directory to their associated changes.
  private changes = new Map<string, readonly Change[]>();

  private readonly commentController = vscode.comments.createCommentController(
    'cros-ide-gerrit',
    'CrOS IDE Gerrit'
  );

  private readonly subscriptions = [this.commentController];

  constructor(
    private readonly sink: Sink,
    private readonly statusBar: vscode.StatusBarItem,
    gitDirsWatcher: services.GitDirsWatcher,
    private readonly preEventHandleForTesting?: () => Promise<void>
  ) {
    const gerritComments = new GerritComments(
      gitDirsWatcher,
      sink,
      this.subscriptions
    );
    gerritComments.onDidUpdateComments(async ({gitDir, changes}) => {
      await this.showChanges(gitDir, changes);
      onDidHandleEventForTestingEmitter.fire();
    });
  }

  /**
   * Generator for iterating over threads associated with an optional path.
   * When filePath is not set, changes associated with all file paths will
   * be returned.
   */
  *commentThreads(filePath?: string): Generator<CommentThread> {
    for (const [curFilePath, curChanges] of this.changes.entries()) {
      if (filePath === undefined || curFilePath === filePath) {
        for (const {revisions} of curChanges) {
          for (const {commentThreadsMap} of Object.values(revisions)) {
            for (const commentThreads of Object.values(commentThreadsMap)) {
              for (const commentThread of commentThreads) {
                yield commentThread;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Fetches the changes and their comments in the Git repo which contains
   * `filePath` (file or directory) and shows them with
   * proper repositioning based on the local diff. It caches the response
   * from Gerrit and uses it unless fetch is true.
   * TODO(davidwelling): Optimize UI experience by merging in changes rather than doing a replace, and accepting filePath as an array.
   */
  async showChanges(
    filePath: string,
    changes?: readonly Change[]
  ): Promise<void> {
    try {
      if (this.preEventHandleForTesting) {
        await this.preEventHandleForTesting();
      }

      const gitDir = await git.findGitDir(filePath, this.sink);
      if (!gitDir) return;
      if (changes) {
        // Clear existing comments.
        this.clearCommentThreadsFromVscode(filePath);
        this.changes.delete(filePath);

        // Save off the new changes if they were found.
        this.changes.set(filePath, changes);
      }

      const threadsToDisplay: {
        shift: number;
        filePath: string;
        commentThread: CommentThread;
      }[] = [];

      for (const {revisions} of this.changes.get(gitDir) ?? []) {
        for (const revision of Object.values(revisions)) {
          const {commitId, commentThreadsMap} = revision;
          const commitExists = await git.checkCommitExists(
            commitId,
            gitDir,
            this.sink
          );

          let hunksMap: git.FilePathToHunks = {};
          if (commitExists) {
            // TODO: If the local branch is rebased after uploading it for review,
            // unrestricted `git diff` will include everything that changed
            // in the entire repo. This can have performance implications.
            const filePaths = Object.keys(commentThreadsMap).filter(
              filePath => !api.MAGIC_PATHS.includes(filePath)
            );
            hunksMap =
              (await git.readDiffHunks(
                gitDir,
                commitId,
                filePaths,
                this.sink
              )) ?? {};
          }

          for (const [filePath, commentThreads] of Object.entries(
            commentThreadsMap
          )) {
            // We still want to show comments that cannot be repositioned correctly.
            const hunks = hunksMap[filePath] ?? [];
            for (const commentThread of commentThreads) {
              const shift = commentThread.getShift(hunks, filePath);
              threadsToDisplay.push({
                shift,
                filePath,
                commentThread,
              });
            }
          }
        }
      }

      for (const {shift, filePath, commentThread} of threadsToDisplay) {
        commentThread.displayForVscode(
          this.commentController,
          gitDir,
          filePath,
          shift
        );
      }

      this.updateStatusBar();
      if (changes && threadsToDisplay.length > 0) {
        metrics.send({
          category: 'background',
          group: 'gerrit',
          action: 'update comments',
          value: threadsToDisplay.length,
        });
      }
      this.sink.clearErrorStatus();
    } catch (err) {
      helpers.showTopLevelError(err as Error, this.sink);
      return;
    }
  }

  collapseAllCommentThreadsInVscode(): void {
    for (const commentThread of this.commentThreads()) {
      commentThread.collapseInVscode();
    }
  }

  private updateStatusBar(): void {
    let nAll = 0,
      nUnresolved = 0;
    for (const commentThread of this.commentThreads()) {
      nAll++;
      if (commentThread.unresolved) nUnresolved++;
    }
    if (nAll === 0) {
      this.statusBar.hide();
      return;
    }
    this.statusBar.text = `$(comment) ${nUnresolved}`;
    this.statusBar.tooltip = `Gerrit comments: ${nUnresolved} unresolved (${nAll} total)`;
    this.statusBar.show();
  }

  clearCommentThreadsFromVscode(filePath: string): void {
    for (const commentThread of this.commentThreads(filePath)) {
      commentThread.clearFromVscode();
    }
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }
}
