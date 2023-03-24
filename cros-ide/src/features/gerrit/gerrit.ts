// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as services from '../../services';
import {underDevelopment} from '../../services/config';
import * as gitDocument from '../../services/git_document';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as metrics from '../metrics/metrics';
import * as api from './api';
import * as auth from './auth';
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
  internalErrorForTesting?: () => Error | undefined
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
    internalErrorForTesting
  );
  subscriptions.push(gerrit);

  subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async document => {
      await gerrit.showChanges(document.fileName);
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
          change: {repoId, changeNumber},
          firstComment: {commentId},
        },
      }: VscodeCommentThread) =>
        openExternal(repoId, `c/${changeNumber}/comment/${commentId}`)
    ),
    // TODO(b/268655627): Instrument this command to send metrics.
    vscode.commands.registerCommand(
      'cros-ide.gerrit.browseCommentThreadAuthor',
      async ({
        gerritCommentThread: {
          change: {repoId},
          firstComment: {authorId},
        },
      }: VscodeCommentThread) => openExternal(repoId, `dashboard/${authorId}`)
    ),
    // TODO(b/268655627): Instrument this command to send metrics.
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
    // TODO(b/268655627): Instrument this command to send metrics.
    vscode.commands.registerCommand(
      'cros-ide.gerrit.browseCommentAuthor',
      async ({
        gerritComment: {
          change: {repoId},
          authorId,
        },
      }: VscodeComment) => openExternal(repoId, `dashboard/${authorId}`)
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
    private readonly internalErrorForTesting?: () => Error | undefined
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
      if (this.internalErrorForTesting) {
        const err = this.internalErrorForTesting();
        if (err) throw err;
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
      let nCommentThreads = 0;
      for (const {revisions} of this.changes.get(gitDir) ?? []) {
        for (const revision of Object.values(revisions)) {
          const {commitId, commentThreadsMap} = revision;
          const commitExists = await git.checkCommitExists(
            commitId,
            gitDir,
            this.sink
          );
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
      if (changes && nCommentThreads > 0) {
        metrics.send({
          category: 'background',
          group: 'gerrit',
          action: 'update comments',
          value: nCommentThreads,
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
    const hunksMap = await git.readDiffHunks(
      gitDir,
      commitId,
      filePaths,
      this.sink
    );
    if (!hunksMap) return;
    shiftCommentThreadsByHunks(commentThreadsMap, hunksMap);
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

/**
 * Gerrit change
 */
export class Change {
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

  equals(other: Change): boolean {
    if (this.changeId !== other.changeId) return false;
    if (
      Object.keys(this.revisions).length !== Object.keys(other.revisions).length
    )
      return false;
    for (const [commitId, revision] of Object.entries(this.revisions)) {
      const r = other.revisions[commitId];
      if (!r) return false;
      if (!revision.equals(r)) return false;
    }
    return true;
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

  /**
   * Returns whether this and other represents the identical revision state,
   * i.e. whether they would produce the same view.
   */
  equals(other: Revision): boolean {
    if (this.revisionNumber !== other.revisionNumber) return false;
    if (
      Object.keys(this.commentInfosMap).length !==
      Object.keys(other.commentInfosMap).length
    ) {
      return false;
    }
    for (const [filePath, commentInfos] of Object.entries(
      this.commentInfosMap
    )) {
      const cs = other.commentInfosMap[filePath];
      if (!cs) return false;

      if (commentInfos.length !== cs.length) return false;

      for (let i = 0; i < commentInfos.length; i++) {
        if (commentInfos[i].id !== cs[i].id) return false;
        if (commentInfos[i].isPublic !== cs[i].isPublic) return false;
        if (commentInfos[i].updated !== cs[i].updated) return false;
      }
    }
    return true;
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
    // A comment thread's context is based off the first comment.
    vscodeCommentThread.contextValue = getCommentContextValue(
      this.comments?.[0]?.commentInfo
    );
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
    label:
      (c.isPublic ? '' : 'Draft / ') + helpers.formatGerritTimestamp(c.updated),
    body: new vscode.MarkdownString(c.message),
    mode: vscode.CommentMode.Preview,
    contextValue: getCommentContextValue(c),
    gerritComment: comment,
  };
}

/**
 * Determines the contextValue that can be assigned to a comment, or comment
 * thread in order to drive ui related functionality. These are referenced
 * within `when` clauses of the package.json file.
 */
function getCommentContextValue(c: api.CommentInfo | null | undefined): string {
  // Used to indicate a comment is public and can be linked to.
  const publicComment = '<public>';

  // Used to indicate a comment is a draft, and can't be linked to.
  const draftComment = '<draft>';

  if (c === null || c === undefined) {
    return draftComment;
  }

  return c.isPublic ? publicComment : draftComment;
}

export const TEST_ONLY = {
  shiftCommentThreadsByHunks,
};
