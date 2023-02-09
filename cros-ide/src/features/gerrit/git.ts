// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';

/** Kind of a Git remote repository */
export type RepoId = 'cros' | 'cros-internal';

/** Gets the Gerrit URL for RepoId. */
export function gerritUrl(repoId: RepoId): string {
  return repoId === 'cros'
    ? 'https://chromium-review.googlesource.com'
    : 'https://chrome-internal-review.googlesource.com';
}

export class UnknownRepoError extends Error {
  constructor(readonly repoId: string, readonly repoUrl: string) {
    super();
  }
}

/**
 * Gets RepoId by git remote, or returns UnknownRepoError, if the
 * remote repo was found but unknown, or some Error for other errors.
 */
export async function getRepoId(
  gitDir: string,
  outputChannel: vscode.OutputChannel
): Promise<RepoId | Error> {
  const gitRemote = await commonUtil.exec('git', ['remote', '-v'], {
    cwd: gitDir,
    logStdout: true,
    logger: outputChannel,
  });
  if (gitRemote instanceof Error) return gitRemote;
  const [repoId, repoUrl] = gitRemote.stdout.split('\n')[0].split(/\s+/);
  if (
    (repoId === 'cros' &&
      repoUrl.startsWith('https://chromium.googlesource.com/')) ||
    (repoId === 'cros-internal' &&
      repoUrl.startsWith('https://chrome-internal.googlesource.com/'))
  ) {
    return repoId;
  }
  return new UnknownRepoError(repoId, repoUrl);
}

export type FilePathToHunks = {
  [filePath: string]: Hunk[];
};

/** Data parsed from diff output such as "@@ -10,3 +15,15 @@"" */
export class Hunk {
  readonly originalEnd;
  readonly currentEnd;

  /** Current size minus the original. */
  readonly sizeDelta;

  constructor(
    readonly originalStart: number,
    readonly originalSize: number,
    readonly currentStart: number,
    readonly currentSize: number
  ) {
    this.originalEnd = originalStart + originalSize;
    this.currentEnd = originalStart + originalSize;
    this.sizeDelta = currentSize - originalSize;
  }

  // Simulates named parameters for readablility.
  static of(data: {
    originalStart: number;
    originalSize: number;
    currentStart: number;
    currentSize: number;
  }): Hunk {
    return new Hunk(
      data.originalStart,
      data.originalSize,
      data.currentStart,
      data.currentSize
    );
  }
}

/** Judges if the commit is available locally. */
export async function commitExists(
  commitId: string,
  dir: string,
  logger?: vscode.OutputChannel
): Promise<boolean | Error> {
  const result = await commonUtil.exec('git', ['cat-file', '-e', commitId], {
    cwd: dir,
    logger,
    ignoreNonZeroExit: true,
  });
  if (result instanceof Error) return result;
  return result.exitStatus === 0;
}

/**
 * Extracts diff hunks of changes made between the `originalCommitId`
 * and the working tree.
 */
export async function readDiffHunks(
  gitDir: string,
  commitId: string,
  paths: string[],
  logger?: vscode.OutputChannel
): Promise<FilePathToHunks | Error> {
  const gitDiff = await commonUtil.exec(
    'git',
    ['diff', '-U0', commitId, '--', ...paths],
    {
      cwd: gitDir,
      logger,
    }
  );
  if (gitDiff instanceof Error) return gitDiff;
  return parseDiffHunks(gitDiff.stdout);
}

/**
 * Parses the output of `git diff -U0` and returns hunks.
 */
function parseDiffHunks(gitDiffContent: string): FilePathToHunks {
  /**
   * gitDiffContent example:`
   * --- a/ide_tooling/cros-ide/src/features/gerrit.ts
   * +++ b/ide_tooling/cros-ide/src/features/gerrit.ts
   * @@ -1,2 +3,4 @@
   * @@ -10,11 +12,13@@
   * --- a/ide_tooling/cros-ide/src/features/git.ts
   * +++ b/ide_tooling/cros-ide/src/features/git.ts
   * @@ -1,2 +3,4 @@
   * `
   * Note, that when a file is added the old name is `--- a/dev/null`,
   * so we need to use the `+++` line to obtain the name.
   */
  const gitDiffHunkRegex =
    /(?:(?:^\+\+\+ b\/(.*)$)|(?:^@@ -([0-9]*)[,]?([0-9]*) \+([0-9]*)[,]?([0-9]*) @@))/gm;
  let regexArray: RegExpExecArray | null;
  const hunksMap: FilePathToHunks = {};
  let hunkFilePath = '';
  while ((regexArray = gitDiffHunkRegex.exec(gitDiffContent)) !== null) {
    if (regexArray[1]) {
      hunkFilePath = regexArray[1];
      hunksMap[hunkFilePath] = [];
    } else {
      const hunk = Hunk.of({
        originalStart: Number(regexArray[2] || '1'),
        originalSize: Number(regexArray[3] || '1'),
        currentStart: Number(regexArray[4] || '1'),
        currentSize: Number(regexArray[5] || '1'),
      });
      hunksMap[hunkFilePath].push(hunk);
    }
  }
  return hunksMap;
}

export type GitLogInfo = {
  readonly localCommitId: string;
  readonly changeId: string;
};

async function isHeadDetached(
  gitDir: string,
  logger: vscode.OutputChannel
): Promise<boolean | Error> {
  // `git rev-parse --symbolic-full-name HEAD` outputs `HEAD`
  // when the head is detached.
  const revParseHead = await commonUtil.exec(
    'git',
    ['rev-parse', '--symbolic-full-name', 'HEAD'],
    {
      cwd: gitDir,
      logStdout: true,
      logger,
    }
  );
  if (revParseHead instanceof Error) {
    return revParseHead;
  }
  return revParseHead.stdout.trim() === 'HEAD';
}

/**
 * Extracts change ids from Git log in the range `@{upstream}..HEAD`
 *
 * The ids are ordered from new to old. If the HEAD is already merged
 * or detached the result will be an empty array.
 */
export async function readGitLog(
  gitDir: string,
  logger: vscode.OutputChannel
): Promise<GitLogInfo[] | Error> {
  const detachedHead = await isHeadDetached(gitDir, logger);
  if (detachedHead instanceof Error) return detachedHead;

  if (detachedHead) {
    logger.appendLine(
      'Detected detached head. Gerrit comments will not be shown.'
    );
    return [];
  }

  const branchLog = await commonUtil.exec('git', ['log', '@{upstream}..HEAD'], {
    cwd: gitDir,
    logger,
  });
  if (branchLog instanceof Error) return branchLog;
  return parseGitLog(branchLog.stdout);
}

function parseGitLog(gitLog: string): GitLogInfo[] {
  const result: GitLogInfo[] = [];
  // Matches the entire commit message from the line
  // with the commit id to Gerrit's change id.
  const messageRegex =
    /^commit (?<commitId>[0-9a-f]+)[\s\S]*?\n\s*?Change-Id: (?<changeId>I[0-9a-z]+)/gm;
  let match: RegExpMatchArray | null;
  while ((match = messageRegex.exec(gitLog)) !== null) {
    result.push({
      localCommitId: match.groups!.commitId,
      changeId: match.groups!.changeId,
    });
  }
  return result;
}

export const TEST_ONLY = {parseDiffHunks, parseGitLog};
