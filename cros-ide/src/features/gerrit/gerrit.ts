// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as dateFns from 'date-fns';
import * as commonUtil from '../../common/common_util';
import * as services from '../../services';
import {underDevelopment} from '../../services/config';
import * as gitDocument from '../../services/git_document';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as metrics from '../metrics/metrics';
import * as api from './api';
import * as git from './git';
import * as helpers from './helpers';
import * as auth from './auth';
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
  statusManager.setTask(GERRIT, {
    status: bgTaskStatus.TaskStatus.OK,
    outputChannel,
  });

  new virtualDocument.GerritDocumentProvider().activate(context);

  const commentController = vscode.comments.createCommentController(
    'cros-ide-gerrit',
    'CrOS IDE Gerrit'
  );

  context.subscriptions.push(commentController);

  if (underDevelopment.gerrit) {
    // Test auth for Gerrit
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'cros-ide.gerrit.internal.testAuth',
        async () => {
          const authCookie = await gerrit.readAuthCookie('cros-internal');
          // Fetch from some internal Gerrit change
          const out = await api.fetchOrThrow(
            'cros-internal',
            'changes/I6743130cd3a84635a66f54f81fa839060f3fcb39/comments',
            authCookie
          );
          outputChannel.appendLine(
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
    commentController,
    outputChannel,
    statusBar,
    statusManager
  );

  let gitHead: string | undefined;

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      void gerrit.showChanges(document.fileName, false);
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
    vscode.commands.registerCommand(
      'cros-ide.gerrit.browseCommentThread',
      async ({
        gerritCommentThread: {
          change: {repoId, changeNumber},
          firstComment: {commentId},
        },
      }: VscodeCommentThread) =>
        openExternal(repoId, `c/${changeNumber}/comment/${commentId}`)
    ),
    vscode.commands.registerCommand(
      'cros-ide.gerrit.browseCommentThreadAuthor',
      async ({
        gerritCommentThread: {
          change: {repoId},
          firstComment: {authorId},
        },
      }: VscodeCommentThread) => openExternal(repoId, `dashboard/${authorId}`)
    ),
    vscode.commands.registerCommand(
      'cros-ide.gerrit.browseComment',
      async ({
        gerritComment: {
          change: {repoId, changeNumber},
          commentId,
        },
      }: VscodeComment) =>
        openExternal(repoId, `c/${changeNumber}/comment/${commentId}`)
    ),
    vscode.commands.registerCommand(
      'cros-ide.gerrit.browseCommentAuthor',
      async ({
        gerritComment: {
          change: {repoId},
          authorId,
        },
      }: VscodeComment) => openExternal(repoId, `dashboard/${authorId}`)
    ),
    gitDirsWatcher.onDidChangeHead(async event => {
      // 1. Check !event.head to avoid closing comments
      //    when the only visible file is closed or replaced.
      // 2. Check event.head !== gitHead to avoid reloading comments
      //    on "head_1 -> undefined -> head_1" sequence.
      if (event.head && event.head !== gitHead) {
        gitHead = event.head;
        await gerrit.showChanges(event.gitDir);
      }
    })
  );
}

async function openExternal(repoId: git.RepoId, path: string): Promise<void> {
  const url = `${git.gerritUrl(repoId)}/${path}`;
  void vscode.env.openExternal(vscode.Uri.parse(url));
}

class Gerrit {
  private changes?: Change[];
  private errorMessageRouter: ErrorMessageRouter;

  constructor(
    private readonly commentController: vscode.CommentController,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly statusBar: vscode.StatusBarItem,
    statusManager: bgTaskStatus.StatusManager
  ) {
    this.errorMessageRouter = new ErrorMessageRouter(
      outputChannel,
      statusManager
    );
  }

  /** Generator for iterating over all comment threads. */
  *commentThreads(): Generator<CommentThread> {
    for (const {revisions} of this.changes ?? []) {
      for (const {commentThreadsMap} of Object.values(revisions)) {
        for (const commentThreads of Object.values(commentThreadsMap)) {
          for (const commentThread of commentThreads) {
            yield commentThread;
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
   */
  async showChanges(filePath: string, fetch = true): Promise<void> {
    try {
      const gitDir = await this.findGitDir(filePath);
      if (!gitDir) return;
      if (fetch) {
        const changes = await this.fetchChangesOrThrow(gitDir);
        if (changes === undefined) return;
        this.clearCommentThreadsFromVscode();
        this.changes = changes;
      }
      if (!this.changes) {
        this.outputChannel.appendLine('No changes found');
        return;
      }
      let nCommentThreads = 0;
      for (const {revisions} of this.changes) {
        for (const revision of Object.values(revisions)) {
          const {commitId, commentThreadsMap} = revision;
          const commitExists = await this.checkCommitExists(commitId, gitDir);
          if (commitExists) {
            await this.shiftCommentThreadsMap(
              gitDir,
              commitId,
              commentThreadsMap
            );
          }
          // We still want to show comments that cannot be repositioned correctly
          for (const [filePath, commentThreads] of Object.entries(
            commentThreadsMap
          )) {
            for (const commentThread of commentThreads) {
              commentThread.displayForVscode(
                this.commentController,
                gitDir,
                filePath
              );
              nCommentThreads++;
            }
          }
        }
      }
      this.updateStatusBar();
      if (fetch && nCommentThreads > 0) {
        metrics.send({
          category: 'background',
          group: 'gerrit',
          action: 'update comments',
          value: nCommentThreads,
        });
      }
    } catch (err) {
      this.errorMessageRouter.show({
        log: `Failed to show Gerrit changes: ${err}`,
        metrics: 'Failed to show Gerrit changes (top-level error)',
      });
      return;
    }
  }

  /**
   * Finds the Git directory for the file
   * or returns undefined with logging when the directory is not found.
   */
  private async findGitDir(filePath: string): Promise<string | undefined> {
    const gitDir = commonUtil.findGitDir(filePath);
    if (!gitDir) {
      this.outputChannel.appendLine('Git directory not found for ' + filePath);
      return;
    }
    return gitDir;
  }

  /**
   * Executes git remote to get RepoId or returns undefined
   * showing an error message if the id is not found.
   */
  async getRepoId(gitDir: string): Promise<git.RepoId | undefined> {
    const repoId = await git.getRepoId(gitDir, this.outputChannel);
    if (repoId instanceof git.UnknownRepoError) {
      this.errorMessageRouter.show({
        log:
          'Unknown remote repo detected: ' +
          `id ${repoId.repoId}, url ${repoId.repoUrl}.\n` +
          'Gerrit comments in this repo are not supported.',
        metrics: '(warning) unknown git remote result',
        noErrorStatus: true,
      });
      return;
    }
    if (repoId instanceof Error) {
      this.errorMessageRouter.show({
        log: `'git remote' failed: ${repoId.message}`,
        metrics: 'git remote failed',
      });
      return;
    }
    const repoKind = repoId === 'cros' ? 'Public' : 'Internal';
    this.outputChannel.appendLine(
      `${repoKind} Chrome remote repo detected at ${gitDir}`
    );
    return repoId;
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

  /**
   * Retrieves the changes from Gerrit Rest API.
   * It can return `undefined` when changes were not obtained.
   * It can throw an error from HTTPS access by `api.getOrThrow`.
   */
  private async fetchChangesOrThrow(
    gitDir: string
  ): Promise<Change[] | undefined> {
    const repoId = await this.getRepoId(gitDir);
    if (repoId === undefined) return;
    const authCookie = await this.readAuthCookie(repoId);
    const gitLogInfos = await this.readGitLog(gitDir);
    if (gitLogInfos.length === 0) return;

    // Fetch the user's account info
    const myAccountInfo = await api.fetchMyAccountInfoOrThrow(
      repoId,
      authCookie
    );
    if (!myAccountInfo) {
      this.outputChannel.appendLine(
        'Calling user info could not be fetched from Gerrit'
      );
      // Don't skip here, because we want to show public information
      // even when authentication has failed
    }

    const changes: Change[] = [];
    for (const {localCommitId, changeId} of gitLogInfos) {
      // Fetch a change
      const changeInfo = await api.fetchChangeOrThrow(
        repoId,
        changeId,
        authCookie
      );
      if (!changeInfo) {
        this.outputChannel.appendLine(
          `Not found on Gerrit: Change ${changeId}`
        );
        continue;
      }

      // Fetch public comments
      const publicCommentInfosMap = await api.fetchPublicCommentsOrThrow(
        repoId,
        changeId,
        authCookie
      );
      if (!publicCommentInfosMap) {
        this.outputChannel.appendLine(
          `Comments for ${changeId} could not be fetched from Gerrit`
        );
        continue;
      }

      // Fetch draft comments
      let draftCommentInfosMap: api.FilePathToCommentInfos | undefined;
      if (myAccountInfo) {
        draftCommentInfosMap = await api.fetchDraftCommentsOrThrow(
          repoId,
          changeId,
          myAccountInfo,
          authCookie
        );
        if (!draftCommentInfosMap) {
          this.outputChannel.appendLine(
            `Drafts for ${changeId} could not be fetched from Gerrit`
          );
          // Don't skip here, because we want to show public information
          // even when authentication has failedgit
        }
      }

      const commentInfosMap = api.mergeCommentInfos(
        publicCommentInfosMap,
        draftCommentInfosMap
      );
      const change = new Change(
        localCommitId,
        repoId,
        changeInfo,
        commentInfosMap
      );
      changes.push(change);
    }
    return changes;
  }

  /**
   * Gets the array of GitLogInfo for local changes,
   * typically these are the changes from HEAD (inclusive) to remote main (exclusive).
   */
  private async readGitLog(gitDir: string): Promise<git.GitLogInfo[]> {
    const gitLogInfos = await git.readGitLog(gitDir, this.outputChannel);
    if (gitLogInfos instanceof Error) {
      this.errorMessageRouter.show({
        log: `Failed to get commits in ${gitDir}`,
        metrics: 'readGitLog failed to get commits',
      });
      return [];
    }
    return gitLogInfos;
  }

  /** Reads gitcookies or returns undefined. */
  async readAuthCookie(repoId: git.RepoId): Promise<string | undefined> {
    const filePath = await auth.getGitcookiesPath(this.outputChannel);
    try {
      const str = await fs.promises.readFile(filePath, {encoding: 'utf8'});
      return auth.parseAuthGitcookies(repoId, str);
    } catch (err) {
      if ((err as {code?: unknown}).code === 'ENOENT') {
        const msg =
          'The gitcookies file for Gerrit auth was not found at ' + filePath;
        this.errorMessageRouter.show(msg);
      } else {
        let msg =
          'Unknown error in reading the gitcookies file for Gerrit auth at ' +
          filePath;
        if (err instanceof Object) msg += ': ' + err.toString();
        this.errorMessageRouter.show(msg);
      }
    }
  }

  /**
   * Returns true if it check that the commit exists locally,
   * or returns false otherwise showing an error message
   */
  private async checkCommitExists(
    commitId: string,
    gitDir: string
  ): Promise<boolean> {
    const commitExists = await git.commitExists(
      commitId,
      gitDir,
      this.outputChannel
    );
    if (commitExists instanceof Error) {
      this.errorMessageRouter.show({
        log: `Local availability check failed for the patchset ${commitId}.`,
        metrics: 'Local commit availability check failed',
      });
      return false;
    }
    if (!commitExists) {
      this.errorMessageRouter.show({
        log:
          `The patchset ${commitId} was not available locally. This happens ` +
          'when some patchsets were uploaded to Gerrit from a different chroot, ' +
          'when a change is submitted, but local repo is not synced, etc.',
        metrics: '(warning) commit not available locally',
        noErrorStatus: true,
      });
    }
    return commitExists;
  }

  /**
   * Updates line numbers in `commentThreadsMap`, which are assumed to be made
   * on `commitId`, so they can be placed in the right lines on the files
   * in the working tree.
   */
  private async shiftCommentThreadsMap(
    gitDir: string,
    commitId: string,
    commentThreadsMap: FilePathToCommentThreads
  ): Promise<void> {
    // TODO: If the local branch is rebased after uploading it for review,
    // unrestricted `git diff` will include everything that changed
    // in the entire repo. This can have performance implications.
    const filePaths = Object.keys(commentThreadsMap).filter(
      filePath => !api.MAGIC_PATHS.includes(filePath)
    );
    const hunksMap = await this.readDiffHunks(gitDir, commitId, filePaths);
    if (!hunksMap) return;
    shiftCommentThreadsByHunks(commentThreadsMap, hunksMap);
  }

  async readDiffHunks(
    gitDir: string,
    commitId: string,
    filePaths: string[]
  ): Promise<git.FilePathToHunks | undefined> {
    const hunksMap = await git.readDiffHunks(
      gitDir,
      commitId,
      filePaths,
      this.outputChannel
    );
    if (hunksMap instanceof Error) {
      this.errorMessageRouter.show({
        log: 'Failed to get git diff to reposition Gerrit comments',
        metrics: 'Failed to get git diff to reposition Gerrit comments',
      });
      return;
    }
    return hunksMap;
  }

  clearCommentThreadsFromVscode(): void {
    for (const commentThread of this.commentThreads()) {
      commentThread.clearFromVscode();
    }
  }
}

/**
 * Helper for showing error messages, sending metrics,
 * and updating the IDE status.
 *
 * It used to be a method in Gerrit class, but it was extracted
 * for testability.
 */
class ErrorMessageRouter {
  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    private readonly statusManager: bgTaskStatus.StatusManager
  ) {}

  /**
   * Show `message.log` in the IDE, set task status to error
   * (unless disabled with `noErrorStatus`),
   * and send `message.metrics` via metrics if it is set.
   *
   * If `message` is a string, it is used both in the log and metrics.
   */
  show(
    message: string | {log: string; metrics?: string; noErrorStatus?: boolean}
  ): void {
    const m: {log: string; metrics?: string; noErrorStatus?: boolean} =
      typeof message === 'string' ? {log: message, metrics: message} : message;

    this.outputChannel.appendLine(m.log);
    if (!m.noErrorStatus) {
      this.statusManager.setStatus(GERRIT, bgTaskStatus.TaskStatus.ERROR);
    }
    if (m.metrics) {
      metrics.send({
        category: 'error',
        group: 'gerrit',
        description: m.metrics,
      });
    }
  }
}

/**
 * Gerrit change
 */
class Change {
  readonly revisions: CommitIdToRevision;
  constructor(
    readonly localCommitId: string,
    readonly repoId: git.RepoId,
    readonly changeInfo: api.ChangeInfo,
    readonly commentInfosMap: api.FilePathToCommentInfos
  ) {
    const revisions = changeInfo.revisions ?? {};
    const splitCommentInfosMap: Map<string, api.FilePathToCommentInfos> =
      helpers.splitPathArrayMap(commentInfosMap, c => c.commit_id!);
    this.revisions = {};
    for (const [commitId, revisionInfo] of Object.entries(revisions)) {
      const rCommentInfosMap = splitCommentInfosMap.get(commitId) ?? {};
      this.revisions[commitId] = new Revision(
        this,
        commitId,
        revisionInfo,
        rCommentInfosMap
      );
    }
  }

  get changeId(): string {
    return this.changeInfo.change_id;
  }
  get changeNumber(): number {
    return this.changeInfo._number;
  }
}

/**
 * Repositions comment threads based on the given hunks.
 */
function shiftCommentThreadsByHunks(
  commentThreadsMap: FilePathToCommentThreads,
  hunksAllFiles: git.FilePathToHunks
) {
  for (const [filePath, commentThreads] of Object.entries(commentThreadsMap)) {
    const hunks = hunksAllFiles[filePath] ?? [];
    for (const commentThread of commentThreads) {
      commentThread.setShift(hunks, filePath);
    }
  }
}

/**
 * Map from the commit id to Revision
 */
type CommitIdToRevision = {
  [commitId: string]: Revision;
};

/**
 * Revision (patchset) of Gerrit
 */
export class Revision {
  readonly commentThreadsMap: FilePathToCommentThreads;
  constructor(
    readonly change: Change,
    readonly commitId: string,
    readonly revisionInfo: api.RevisionInfo,
    readonly commentInfosMap: api.FilePathToCommentInfos
  ) {
    this.commentThreadsMap = {};
    for (const [filePath, apiCommentInfos] of Object.entries(commentInfosMap)) {
      // Copy the input to avoid modifying data received from Gerrit API.
      const commentInfos = [...apiCommentInfos];
      // Sort the input to make sure we see ids before they are used in in_reply_to.
      commentInfos.sort((c1, c2) => c1.updated.localeCompare(c2.updated));
      // Get a map from the head comment id to the CommentInfo array array
      const splitCommentInfos: api.CommentInfo[][] = [];
      const idxMap = new Map<string, number>();
      for (const commentInfo of commentInfos) {
        const inReplyTo = commentInfo.in_reply_to;
        // idx is undefined for the first comment in a thread,
        // and for a reply to a comment we haven't seen.
        // The second case should not happen.
        let idx = inReplyTo ? idxMap.get(inReplyTo) : undefined;
        if (idx === undefined) {
          idx = splitCommentInfos.length;
          splitCommentInfos.push([commentInfo]);
        } else {
          splitCommentInfos[idx].push(commentInfo);
        }
        idxMap.set(commentInfo.id, idx);
      }
      // Construct the CommentThread array
      const commentThreads = [];
      for (const commentInfos of splitCommentInfos) {
        commentThreads.push(new CommentThread(this, commentInfos));
      }
      this.commentThreadsMap[filePath] = commentThreads;
    }
  }

  get revisionNumber(): number | 'edit' {
    return this.revisionInfo._number;
  }
}

/**
 * Like FilePathToCommentInfos, but the comments are partitioned
 * into comment threads represented as arrays of comments.
 */
export type FilePathToCommentThreads = {
  [filePath: string]: CommentThread[];
};

/**
 * Represents a Gerrit comment thread that belongs to a Gerrit CL.
 * The usage of this class is as follows.
 * 1. Initialize with the comment infos and the local git log info for the CL.
 * 2. Call setShift to update the shift count and displayForVscode to display the comment thread
 *    on VSCode.
 * 3. To clear the comment thread from VSCode, call clearFromVscode
 */
export class CommentThread {
  readonly comments: Comment[];
  private vscodeCommentThread?: VscodeCommentThread;
  /**
   * Line shift for repositioning the comment thread from the original
   * location to the corresponding line in the working tree.
   * (Column shift is ignored)
   */
  private shift = 0;

  constructor(readonly revision: Revision, commentInfos: api.CommentInfo[]) {
    this.comments = [];
    for (const commentInfo of commentInfos) {
      const comment = new Comment(this, commentInfo);
      this.comments.push(comment);
    }
  }

  get change(): Change {
    return this.revision.change;
  }

  get firstComment(): Comment {
    return this.comments[0];
  }
  get lastComment(): Comment {
    return this.comments[this.comments.length - 1];
  }

  /** Original line */
  get originalLine(): number | undefined {
    return this.firstComment.commentInfo.line;
  }

  /** Shifted line */
  get line(): number | undefined {
    const ol = this.originalLine;
    if (ol === undefined) return undefined;
    return ol + this.shift;
  }

  /** Shifted range */
  get range(): api.CommentRange | undefined {
    const r = this.firstComment.commentInfo.range;
    if (r === undefined) return undefined;
    return {
      start_line: r.start_line + this.shift,
      start_character: r.start_character,
      end_line: r.end_line + this.shift,
      end_character: r.end_character,
    };
  }

  get commitId(): string {
    // TODO(b:216048068): make sure we have the commit_id
    return this.firstComment.commentInfo.commit_id!;
  }

  /** A thread is unresolved if its last comment is unresolved. */
  get unresolved(): boolean {
    // Unresolved can be undefined according to the API documentation,
    // but Gerrit always sent it on the changes the we inspected.
    return this.lastComment.commentInfo.unresolved!;
  }

  /**
   * Repositions threads based on the given hunks.
   *
   * Thread position is determined by its first comment,
   * so only the first comment is updated. The updates are in-place.
   */
  setShift(hunks: readonly git.Hunk[], filePath: string): void {
    let shift = 0;
    const ol = this.originalLine;
    for (const hunk of hunks) {
      if (this.followsHunk(hunk)) {
        // Comment outside the hunk
        shift += hunk.sizeDelta;
      } else if (this.withinRange(hunk.originalStart, hunk.originalEnd)) {
        // Comment within the hunk
        // Ensure the comment within the hunk still resides in the
        // hunk. If the hunk removes all the lines, the comment will
        // be moved to the line preceding the hunk.
        if (hunk.sizeDelta < 0 && ol !== undefined) {
          const protrusion = ol - (hunk.originalStart + hunk.currentSize) + 1;
          if (protrusion > 0) shift -= protrusion;
        }
      }
    }
    // Make sure we do not shift comments before the first line
    // because it causes errors (lines beyond the end of file are fine though).
    //
    // Note, that line numbers are 1-based. The code that shifts comments within
    // deleted hunks may put comments on line 0 (we use `<=` in case of unknown bugs),
    // so we adjust `shift` so that `originalLine + shift == 1`.
    if (ol !== undefined && ol + shift <= 0) shift = -(ol - 1);
    if (filePath === '/COMMIT_MSG' && ol !== undefined) {
      // Compensate the difference between commit message on Gerrit and Terminal
      shift -= ol > 6 ? 6 : ol - 1;
    }
    this.shift = shift;
  }

  overwriteShiftForTesting(shift: number): void {
    this.shift = shift;
  }

  /**
   * True if a thread starts after the hunk ends. Such threads should be moved
   * by the size change introduced by the hunk.
   */
  followsHunk(hunk: git.Hunk): boolean {
    const ol = this.originalLine;
    if (!ol) return false;
    // Case 1: hunks that insert lines.
    // The original side is `N,0` and the hunk inserts lines between N and N+1.
    if (hunk.originalSize === 0) return ol > hunk.originalStart;
    // Case 2: Modifications and deletions
    // The original side is `N,size` and the hunk modifies 'size' lines starting from N.
    return ol >= hunk.originalStart + hunk.originalSize;
  }

  /**
   * Returns whether the comment is in the range between
   * minimum (inclusive) and maximum (exclusive).
   */
  withinRange(minimum: number, maximum: number): boolean {
    const ol = this.originalLine;
    return ol !== undefined && ol >= minimum && ol < maximum;
  }

  /**
   * Displays the comment thread in the UI,
   * creating a VS Code comment thread if not yet created.
   * To reposition by local changes, call setShift before calling it.
   */
  displayForVscode(
    controller: vscode.CommentController,
    gitDir: string,
    filePath: string
  ): void {
    if (this.vscodeCommentThread) {
      // Recompute the range
      this.vscodeCommentThread.range = this.getVscodeRange();
      return;
    }
    this.createVscodeCommentThread(controller, gitDir, filePath);
  }

  private createVscodeCommentThread(
    controller: vscode.CommentController,
    gitDir: string,
    path: string
  ): void {
    const dataUri = this.getDataUri(gitDir, path);
    const vscodeCommentThread = controller.createCommentThread(
      dataUri,
      this.getVscodeRange(),
      this.comments.map(comment => toVscodeComment(comment))
    ) as VscodeCommentThread;
    vscodeCommentThread.gerritCommentThread = this; // Remember the comment thread
    vscodeCommentThread.canReply = false;
    const revisionNumber = this.revision.revisionNumber;
    // TODO(b:216048068): We should indicate resolved/unresolved with UI style.
    if (this.unresolved) {
      vscodeCommentThread.label = `Patchset ${revisionNumber} / Unresolved`;
      vscodeCommentThread.collapsibleState =
        vscode.CommentThreadCollapsibleState.Expanded;
    } else {
      vscodeCommentThread.label = `Patchset ${revisionNumber} / Resolved`;
    }
    this.vscodeCommentThread = vscodeCommentThread;
  }

  private getDataUri(gitDir: string, filePath: string): vscode.Uri {
    if (filePath === '/COMMIT_MSG') {
      return gitDocument.commitMessageUri(
        gitDir,
        this.change.localCommitId,
        'gerrit commit msg'
      );
    } else if (filePath === '/PATCHSET_LEVEL') {
      return virtualDocument.patchSetUri(gitDir, this.change.changeId);
    } else {
      return vscode.Uri.file(path.join(gitDir, filePath));
    }
  }

  /** Gets vscode.Range for the comment. */
  private getVscodeRange(): vscode.Range {
    const r = this.range;
    if (r !== undefined) {
      // Comment thread for some range
      // VSCode is 0-base, whereas Gerrit has 1-based lines and 0-based columns.
      return new vscode.Range(
        r.start_line - 1,
        r.start_character,
        r.end_line - 1,
        r.end_character
      );
    }
    const l = this.line;
    if (l !== undefined) {
      // Comment thread for a line
      return new vscode.Range(l - 1, 0, l - 1, 0);
    }
    // Comment thread for the entire file
    return new vscode.Range(0, 0, 0, 0);
  }

  clearFromVscode(): void {
    if (this.vscodeCommentThread) {
      this.vscodeCommentThread.dispose();
      this.vscodeCommentThread = undefined;
    }
  }

  collapseInVscode(): void {
    if (this.vscodeCommentThread) {
      this.vscodeCommentThread.collapsibleState =
        vscode.CommentThreadCollapsibleState.Collapsed;
    }
  }
}

/** vscode.CommentThread extended with a reference to CommentThread */
interface VscodeCommentThread extends vscode.CommentThread {
  /**
   * Reference to the comment thread, which we can use in
   * event callbacks on the VS Code comment thread
   */
  gerritCommentThread: CommentThread;
}

/** Gerrit comment */
class Comment {
  constructor(
    readonly commentThread: CommentThread,
    readonly commentInfo: api.CommentInfo
  ) {}

  get change(): Change {
    return this.commentThread.change;
  }
  get authorId(): number | undefined {
    return this.commentInfo.author?._account_id;
  }
  get commentId(): string {
    return this.commentInfo.id;
  }
}

/** vscode.Comment extended with a reference to Comment */
interface VscodeComment extends vscode.Comment {
  /**
   * Reference to the comment, which we can use in
   * event callbacks on the VS Code comment
   */
  readonly gerritComment: Comment;
}

/**
 * Turns Comment into VscodeComment.
 */
function toVscodeComment(comment: Comment): VscodeComment {
  const c = comment.commentInfo;
  return {
    author: {name: api.accountName(c.author)},
    label: (c.isPublic ? '' : 'Draft / ') + formatGerritTimestamp(c.updated),
    body: new vscode.MarkdownString(c.message),
    mode: vscode.CommentMode.Preview,
    contextValue: c.isPublic ? '<public>' : '<draft>',
    gerritComment: comment,
  };
}

/**
 * Convert UTC timestamp returned by Gerrit into a localized human fiendly format.
 *
 * Sample input: '2022-09-27 09:25:04.000000000'
 */
function formatGerritTimestamp(timestamp: string): string {
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

export const TEST_ONLY = {
  ErrorMessageRouter,
  formatGerritTimestamp,
  Gerrit,
  shiftCommentThreadsByHunks,
};
