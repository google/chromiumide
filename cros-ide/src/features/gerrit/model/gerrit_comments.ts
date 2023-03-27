// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {GitDirsWatcher} from '../../../services';
import * as api from '../api';
import * as auth from '../auth';
import {Change} from '../data';
import * as git from '../git';
import {Sink} from '../sink';
import {Clock} from './clock';
import {Ticket} from './ticket';

export const POLL_INTERVAL_MILLIS = 10 * 1000;
export const FETCH_THROTTLE_INTERVAL_MILLIS = 500;

/**
 * Retrieves and holds current comments from Gerrit. It does this by fetching
 * changes from Gerrit periodically or upon event. It fires an event whenever
 * the comments update.
 */
export class GerritComments implements vscode.Disposable {
  private readonly gitDirToChanges = new Map<string, [Ticket, Change[]]>();
  private readonly gitDirToTimeoutId = new Map<string, NodeJS.Timeout>();

  private readonly onDidUpdateCommentsEmitter = new vscode.EventEmitter<{
    gitDir: string;
    changes: readonly Change[];
  }>();
  readonly onDidUpdateComments = this.onDidUpdateCommentsEmitter.event;

  private readonly subscriptions: vscode.Disposable[] = [
    this.onDidUpdateCommentsEmitter,
  ];

  constructor(
    private gitDirsWatcher: GitDirsWatcher,
    private readonly sink: Sink,
    subscriptions?: vscode.Disposable[]
  ) {
    subscriptions?.push(this);

    let gitHead = '';

    const clock = new Clock(POLL_INTERVAL_MILLIS, this.subscriptions);

    this.subscriptions.push(
      gitDirsWatcher.onDidChangeHead(event => {
        // 1. Check !event.head to avoid closing comments
        //    when the only visible file is closed or replaced.
        // 2. Check event.head !== gitHead to avoid reloading comments
        //    on "head_1 -> undefined -> head_1" sequence.
        if (event.head && event.head !== gitHead) {
          gitHead = event.head;
          this.requestFetch(event.gitDir, new Ticket());
        }
      }),
      clock.onDidTick(() => {
        this.refresh();
      }),
      // TODO(b/268655627): Instrument this command to send metrics.
      vscode.commands.registerCommand('cros-ide.gerrit.refreshComments', () => {
        this.refresh();
      })
    );
  }

  private requestFetch(gitDir: string, ticket: Ticket): void {
    const existingTimeoutId = this.gitDirToTimeoutId.get(gitDir);
    if (existingTimeoutId !== undefined) {
      clearTimeout(existingTimeoutId);
    }

    const timeoutId = setTimeout(() => {
      void this.fetch(gitDir, ticket);
    }, FETCH_THROTTLE_INTERVAL_MILLIS);
    this.gitDirToTimeoutId.set(gitDir, timeoutId);
  }

  private async fetch(gitDir: string, ticket: Ticket): Promise<void> {
    // Fetch current changes.
    let changes: Change[];
    try {
      const cs = await fetchChangesOrThrow(gitDir, this.sink);
      if (!cs) {
        this.sink.appendLine('No changes found');
        return;
      }
      changes = cs;
    } catch (e) {
      const err = e as Error;
      this.sink.show({
        log: `Failed to fetch changes: ${err.message}`,
        metrics: `Failed to fetch changes: ${err.message}`,
        noErrorStatus: true,
      });
      return;
    }

    // Return if newer change exists or no change detected.
    const cur = this.gitDirToChanges.get(gitDir);
    if (cur) {
      const [knownTicket, knownChanges] = cur;
      if (knownTicket.newerThan(ticket)) return;
      if (
        knownChanges &&
        knownChanges.length === changes.length &&
        knownChanges.every((c, i) => c.equals(changes[i]))
      ) {
        return;
      }
    }

    this.gitDirToChanges.set(gitDir, [ticket, changes]);
    this.onDidUpdateCommentsEmitter.fire({
      gitDir,
      changes,
    });
  }

  private refresh(): void {
    for (const curGitDir of this.gitDirsWatcher.visibleGitDirs) {
      this.requestFetch(curGitDir, new Ticket());
    }
  }

  dispose() {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }
}

/**
 * Retrieves the changes from Gerrit Rest API.
 * It can return `undefined` when changes were not obtained.
 * It can throw an error from HTTPS access by `api.getOrThrow`.
 */
async function fetchChangesOrThrow(
  gitDir: string,
  sink: Sink
): Promise<Change[] | undefined> {
  const repoId = await git.getRepoId(gitDir, sink);
  if (repoId === undefined) return;
  const authCookie = await auth.readAuthCookie(repoId, sink);
  const gitLogInfos = await git.readGitLog(gitDir, sink);
  if (gitLogInfos.length === 0) return;

  // Fetch the user's account info
  const myAccountInfo = await api.fetchMyAccountInfoOrThrow(repoId, authCookie);
  if (!myAccountInfo) {
    sink.appendLine('Calling user info could not be fetched from Gerrit');
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
      sink.appendLine(`Not found on Gerrit: Change ${changeId}`);
      continue;
    }

    // Fetch public comments
    const publicCommentInfosMap = await api.fetchPublicCommentsOrThrow(
      repoId,
      changeId,
      authCookie
    );
    if (!publicCommentInfosMap) {
      sink.appendLine(
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
        sink.appendLine(
          `Drafts for ${changeId} could not be fetched from Gerrit`
        );
        // Don't skip here, because we want to show public information
        // even when authentication has failed
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
