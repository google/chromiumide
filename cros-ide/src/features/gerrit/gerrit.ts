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
  GitFileKey,
  VscodeComment,
  VscodeCommentThread,
} from './data';
import * as git from './git';
import * as helpers from './helpers';
import {DiffHunksClient, GerritComments} from './model';
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
        'chromiumide.gerrit.internal.testAuth',
        async () => {
          const authCookie = await auth.readAuthCookie('cros-internal', sink);

          const client = new api.RawGerritClient();
          // Fetch from some internal Gerrit change
          const infos: api.FilePathToBaseCommentInfos | undefined =
            await client.fetchOrThrow(
              'cros-internal',
              'changes/I6743130cd3a84635a66f54f81fa839060f3fcb39/comments',
              authCookie
            );
          const out = infos && JSON.stringify(infos);
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

  const focusCommentsPanel = 'chromiumide.gerrit.focusCommentsPanel';
  subscriptions.push(
    vscode.commands.registerCommand(focusCommentsPanel, () => {
      void vscode.commands.executeCommand(
        'workbench.action.focusCommentsPanel'
      );
      metrics.send({
        category: 'interactive',
        group: 'gerrit',
        description: 'focus comments panel',
        name: 'gerrit_focus_comments_panel',
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

  subscriptions.push(
    vscode.commands.registerCommand(
      'chromiumide.gerrit.collapseAllCommentThreads',
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
          description: 'collapse all comment threads',
          name: 'gerrit_collapse_all_comment_threads',
        });
      }
    ),
    // TODO(b/268655627): Instrument this command to send metrics.
    vscode.commands.registerCommand(
      'chromiumide.gerrit.browseCommentThread',
      async ({
        gerritCommentThread: {
          changeNumber,
          firstComment: {commentId},
          repoId,
        },
      }: VscodeCommentThread) =>
        openExternal(
          repoId,
          `c/${encodeURIComponent(changeNumber)}/comment/${encodeURIComponent(
            commentId
          )}`
        )
    ),
    // TODO(b/268655627): Instrument this command to send metrics.
    vscode.commands.registerCommand(
      'chromiumide.gerrit.browseCommentThreadAuthor',
      async ({
        gerritCommentThread: {
          firstComment: {authorId},
          repoId,
        },
      }: VscodeCommentThread) =>
        openExternal(repoId, `dashboard/${encodeURIComponent(authorId)}`)
    ),
    // TODO(b/268655627): Instrument this command to send metrics.
    vscode.commands.registerCommand(
      'chromiumide.gerrit.browseComment',
      async ({
        gerritComment: {changeNumber, commentId, repoId},
      }: VscodeComment) =>
        openExternal(
          repoId,
          `c/${encodeURIComponent(changeNumber)}/comment/${encodeURIComponent(
            commentId
          )}`
        )
    ),
    // TODO(b/268655627): Instrument this command to send metrics.
    vscode.commands.registerCommand(
      'chromiumide.gerrit.browseCommentAuthor',
      async ({gerritComment: {authorId, repoId}}: VscodeComment) =>
        openExternal(repoId, `dashboard/${encodeURIComponent(authorId)}`)
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
  private readonly changes = new Map<string, readonly Change[]>();

  // All the visible vscode threads. It maps git root directory to a map from
  // thread id to vscode comment thread.
  private readonly gitDirToThreadIdToVscodeCommentThread = new Map<
    string,
    Map<string, VscodeCommentThread>
  >();

  private readonly commentController = vscode.comments.createCommentController(
    'chromiumide-gerrit',
    'ChromiumIDE Gerrit'
  );

  // Throttles `showChanges` requests.
  private readonly jobManager = new JobManager<void>();

  private readonly gitDiffHunksClient = new DiffHunksClient(this.sink);

  private readonly subscriptions: vscode.Disposable[] = [
    this.commentController,
    vscode.commands.registerCommand(
      'chromiumide.gerrit.reply',
      async ({thread, text}: vscode.CommentReply) => {
        await this.reply(thread as VscodeCommentThread, text);
      }
    ),
    vscode.commands.registerCommand(
      'chromiumide.gerrit.replyAndResolve',
      async ({thread, text}: vscode.CommentReply) => {
        await this.reply(
          thread as VscodeCommentThread,
          text,
          /* unresolved = */ false
        );
      }
    ),
    vscode.commands.registerCommand(
      'chromiumide.gerrit.replyAndUnresolve',
      async ({thread, text}: vscode.CommentReply) => {
        await this.reply(
          thread as VscodeCommentThread,
          text,
          /* unresolved = */ true
        );
      }
    ),
    vscode.workspace.onDidSaveTextDocument(async document => {
      this.gitDiffHunksClient.evictCacheForDocument(document);
      // Avoid performing many git operations concurrently.
      await this.jobManager.offer(() => this.showChanges(document.fileName));
      onDidHandleEventForTestingEmitter.fire();
    }),
  ];

  private readonly gerritComments;

  constructor(
    private readonly sink: Sink,
    private readonly statusBar: vscode.StatusBarItem,
    gitDirsWatcher: services.GitDirsWatcher,
    private readonly preEventHandleForTesting?: () => Promise<void>
  ) {
    this.gerritComments = new GerritComments(
      gitDirsWatcher,
      sink,
      this.subscriptions
    );
    this.gerritComments.onDidUpdateComments(async ({gitDir, changes}) => {
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
        // Save off the new changes if they were found.
        this.changes.set(filePath, changes);
      }

      const gitFileToDiffHunks = new Map<GitFileKey, git.Hunk[]>();

      for (const {revisions} of this.changes.get(gitDir) ?? []) {
        for (const revision of Object.values(revisions)) {
          const {commitId, commentThreadsMap} = revision;
          const commitExists = await git.checkCommitExists(
            commitId,
            gitDir,
            this.sink
          );
          if (!commitExists) continue;

          // TODO: If the local branch is rebased after uploading it for review,
          // unrestricted `git diff` will include everything that changed
          // in the entire repo. This can have performance implications.
          const filePaths = Object.keys(commentThreadsMap).filter(
            filePath => !api.MAGIC_PATHS.includes(filePath)
          );
          const hunksMap = await this.gitDiffHunksClient.readDiffHunks(
            gitDir,
            commitId,
            filePaths
          );

          for (const [filePath, hunks] of Object.entries(hunksMap)) {
            gitFileToDiffHunks.set(
              GitFileKey.create(gitDir, commitId, filePath),
              hunks
            );
          }
        }
      }

      const threadsToDisplay: {
        shift: number;
        filePath: string;
        commentThread: CommentThread;
      }[] = [];

      for (const {revisions} of this.changes.get(gitDir) ?? []) {
        for (const revision of Object.values(revisions)) {
          const {commitId, commentThreadsMap} = revision;

          for (const [filePath, commentThreads] of Object.entries(
            commentThreadsMap
          )) {
            // We still want to show comments that cannot be repositioned correctly.
            const hunks =
              gitFileToDiffHunks.get(
                GitFileKey.create(gitDir, commitId, filePath)
              ) ?? [];

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

      // Atomically update vscode threads to display.
      if (!this.gitDirToThreadIdToVscodeCommentThread.has(gitDir)) {
        this.gitDirToThreadIdToVscodeCommentThread.set(gitDir, new Map());
      }
      const threadIdToVscodeCommentThread =
        this.gitDirToThreadIdToVscodeCommentThread.get(gitDir)!;

      const threadIdsToRemove = new Set(threadIdToVscodeCommentThread.keys());
      for (const {shift, filePath, commentThread} of threadsToDisplay) {
        const id = commentThread.id;

        threadIdsToRemove.delete(id);

        const existingThread = threadIdToVscodeCommentThread.get(id);

        if (existingThread) {
          commentThread.decorateVscodeCommentThread(existingThread, shift);
          continue;
        }

        threadIdToVscodeCommentThread.set(
          id,
          commentThread.createVscodeCommentThread(
            this.commentController,
            gitDir,
            filePath,
            shift
          )
        );
      }
      for (const id of threadIdsToRemove.keys()) {
        threadIdToVscodeCommentThread.get(id)?.dispose();
        threadIdToVscodeCommentThread.delete(id);
      }

      this.updateStatusBar();
      if (changes && threadsToDisplay.length > 0) {
        metrics.send({
          category: 'background',
          group: 'gerrit',
          description: 'update comments',
          name: 'gerrit_update_comments',
          displayed_threads_count: threadsToDisplay.length,
        });
      }
      this.sink.clearErrorStatus();
    } catch (err) {
      helpers.showTopLevelError(err as Error, this.sink);
      return;
    }
  }

  collapseAllCommentThreadsInVscode(): void {
    for (const threadIdToVscodeCommentThread of this.gitDirToThreadIdToVscodeCommentThread.values()) {
      for (const commentThread of threadIdToVscodeCommentThread.values()) {
        commentThread.collapsibleState =
          vscode.CommentThreadCollapsibleState.Collapsed;
      }
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

  private async reply(
    thread: VscodeCommentThread,
    message: string,
    unresolved?: boolean
  ): Promise<void> {
    const {
      repoId,
      changeId,
      lastComment: {commentId},
      revisionNumber,
      filePath,
    } = thread.gerritCommentThread;
    const authCookie = await auth.readAuthCookie(repoId, this.sink);
    if (!authCookie) return;

    // Comment shown until real draft is fetched from Gerrit.
    const tentativeComment: vscode.Comment = {
      body: message,
      mode: vscode.CommentMode.Preview,
      author: {name: 'Draft being created'},
    };

    thread.comments = [...thread.comments, tentativeComment];
    thread.canReply = false;

    try {
      await api.createDraftOrThrow(
        repoId,
        authCookie,
        changeId,
        revisionNumber.toString(),
        {
          in_reply_to: commentId,
          path: filePath,
          message,
          unresolved,
        },
        this.sink
      );
    } catch (e) {
      const err = e as Error;
      const message = `Failed to create draft: ${err}`;
      this.sink.show({
        log: message,
        metrics: message,
        noErrorStatus: true,
      });
      void vscode.window.showErrorMessage(message);
    }

    await this.gerritComments.refresh();
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }
}
