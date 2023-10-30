// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as commonUtil from '../../common/common_util';
import {envForDepotTools} from '../../common/depot_tools';
import {Sink} from './sink';

/** Kind of a Git remote repository */
export type RepoId = 'cros' | 'cros-internal' | 'chromium';

/** Gets the Gerrit URL for RepoId. */
export function gerritUrl(repoId: RepoId): string {
  switch (repoId) {
    case 'cros':
    case 'chromium':
      return 'https://chromium-review.googlesource.com';
    case 'cros-internal':
      return 'https://chrome-internal-review.googlesource.com';
  }
}

/**
 * Gets RepoId by git remote. It returns undefined if error happens.
 * Errors are reported to sink.
 */
export async function getRepoId(
  gitDir: string,
  sink: Sink
): Promise<RepoId | undefined> {
  const gitRemote = await commonUtil.exec('git', ['remote', '-v'], {
    cwd: gitDir,
    logStdout: true,
    logger: sink,
  });
  if (gitRemote instanceof Error) {
    sink.show({
      log: `'git remote' failed: ${gitRemote.message}`,
      metrics: 'git remote failed',
    });
    return;
  }
  const [remoteName, repoUrl] = gitRemote.stdout.split('\n')[0].split(/\s+/);
  if (
    (remoteName === 'cros' &&
      repoUrl.startsWith('https://chromium.googlesource.com/')) ||
    (remoteName === 'cros-internal' &&
      repoUrl.startsWith('https://chrome-internal.googlesource.com/'))
  ) {
    const repoKind = remoteName === 'cros' ? 'Public' : 'Internal';
    sink.appendLine(`${repoKind} ChromeOS remote repo detected at ${gitDir}`);

    return remoteName;
  }
  if (repoUrl.startsWith('https://chromium.googlesource.com/chromium/')) {
    sink.appendLine(`Public Chromium remote repo detected at ${gitDir}`);
    return 'chromium';
  }

  sink.show({
    log:
      'Unknown remote repo detected: ' +
      `remote name ${remoteName}, url ${repoUrl}.\n` +
      'Gerrit comments in this repo are not supported.',
    metrics: '(warning) unknown git remote result',
    noErrorStatus: true,
  });

  return;
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

/**
 * Returns true if it check that the commit exists locally,
 * or returns false otherwise showing an error message
 */
export async function checkCommitExists(
  commitId: string,
  gitDir: string,
  sink: Sink
): Promise<boolean> {
  const exists = await commitExists(commitId, gitDir, sink);
  if (exists instanceof Error) {
    sink.show({
      log: `Local availability check failed for the patchset ${commitId}.`,
      metrics: 'Local commit availability check failed',
    });
    return false;
  }
  if (!exists) {
    sink.show({
      log:
        `The patchset ${commitId} was not available locally. This happens ` +
        'when some patchsets were uploaded to Gerrit from a different chroot, ' +
        'when a change is submitted, but local repo is not synced, etc.',
      metrics: '(warning) commit not available locally',
      noErrorStatus: true,
    });
  }
  return exists;
}

/** Judges if the commit is available locally. */
async function commitExists(
  commitId: string,
  dir: string,
  sink: Sink
): Promise<boolean | Error> {
  const result = await commonUtil.exec('git', ['cat-file', '-e', commitId], {
    cwd: dir,
    logger: sink,
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
  sink: Sink
): Promise<FilePathToHunks | undefined> {
  const gitDiff = await commonUtil.exec(
    'git',
    ['diff', '-U0', commitId, '--', ...paths],
    {
      cwd: gitDir,
      logger: sink,
    }
  );
  if (gitDiff instanceof Error) {
    sink.show({
      log: 'Failed to get git diff to reposition Gerrit comments',
      metrics: 'Failed to get git diff to reposition Gerrit comments',
    });
    return;
  }
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
   * Note, that when a file is added the old name is `--- /dev/null`
   * and when a file is removed the new name is `+++ /dev/null`,
   * so we need to check both `+++` and `---` line to obtain the name.
   */
  const gitDiffHunkRegex =
    /(?:(?:^(?:\+\+\+ b|--- a)\/(.*)$)|(?:^@@ -([0-9]*)[,]?([0-9]*) \+([0-9]*)[,]?([0-9]*) @@))/gm;
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

/**
 * Extracts change ids from Git log in the range `@{upstream}..HEAD`
 *
 * The ids are ordered from new to old. If the HEAD is already merged
 * or detached the result will be an empty array.
 *
 * If error happens it is reported to sink and an empty array is returned.
 */
export async function readGitLog(
  gitDir: string,
  sink: Sink
): Promise<GitLogInfo[]> {
  try {
    return readGitLogOrThrow(gitDir, sink);
  } catch (e) {
    sink.show({
      log: `Failed to get commits in ${gitDir}`,
      metrics: 'readGitLog failed to get commits',
    });
    return [];
  }
}

async function readGitLogOrThrow(gitDir: string, sink: Sink) {
  const upstreamBranch = await getUpstreamOrThrow(gitDir, sink);
  if (!upstreamBranch) {
    sink.appendLine(
      'Upstream branch not found. Gerrit comments will not be shown. If you think this is an error, please file go/chromiumide-new-bug'
    );
    return [];
  }
  const branchLog = await commonUtil.execOrThrow(
    'git',
    [
      'log',
      `${upstreamBranch}..HEAD`,
      // Change the output format to just include the commit id (%H) followed by a space and the
      // `Change-Id` trailer value.
      '--format=%H %(trailers:key=Change-Id,valueonly)',
    ],
    {
      cwd: gitDir,
      logger: sink,
    }
  );
  return parseGitLog(branchLog.stdout);
}

async function getUpstreamOrThrow(
  gitDir: string,
  sink: Sink
): Promise<string | undefined> {
  if (!(await isHeadDetachedOrThrow(gitDir, sink))) {
    return '@{upstream}';
  }
  // Create mapping from local ref to upstream.
  const localRefToUpstream = new Map<string, string>();
  for (const localRefAndUpstream of (
    await commonUtil.execOrThrow(
      'git',
      ['branch', '--format=%(refname:short) %(upstream:short)'],
      {cwd: gitDir, logger: sink}
    )
  ).stdout.split('\n')) {
    const x = localRefAndUpstream.split(' ');
    if (x.length < 2) continue;
    const [ref, upstream] = x;
    localRefToUpstream.set(ref, upstream);
  }
  // Find the latest local ref from reflog.
  const limit = 1000; // avoid reading arbitrarily long log.
  for (const ref of (
    await commonUtil.execOrThrow(
      'git',
      ['reflog', '--pretty=%D', `-${limit}`],
      {cwd: gitDir, logger: sink}
    )
  ).stdout.split('\n')) {
    const upstream = localRefToUpstream.get(ref);
    if (upstream) return upstream;
  }
  return undefined;
}

async function isHeadDetachedOrThrow(
  gitDir: string,
  sink: Sink
): Promise<boolean> {
  // `git rev-parse --symbolic-full-name HEAD` outputs `HEAD`
  // when the head is detached.
  const revParseHead = await commonUtil.execOrThrow(
    'git',
    ['rev-parse', '--symbolic-full-name', 'HEAD'],
    {
      cwd: gitDir,
      logStdout: true,
      logger: sink,
    }
  );
  return revParseHead.stdout.trim() === 'HEAD';
}

function parseGitLog(gitLog: string): GitLogInfo[] {
  const result: GitLogInfo[] = [];
  const messageRegex = /^(?<commitId>[0-9a-f]+) (?<changeId>I[0-9a-z]+)$/gm;
  let match: RegExpMatchArray | null;
  while ((match = messageRegex.exec(gitLog)) !== null) {
    result.push({
      localCommitId: match.groups!.commitId,
      changeId: match.groups!.changeId,
    });
  }
  return result;
}

/**
 * Reads the change id from the currently checked-out branch using `git cl` tooling (therefore not
 * applicable to ChromiumOS).
 *
 * TODO(b/295017592): Consider traversing all local upstreams to show comments of dependent changes
 * as well.
 */
export async function readChangeIdsUsingGitCl(
  gitDir: string,
  sink: Sink
): Promise<GitLogInfo[]> {
  const tempPath = await fs.mkdtemp(
    path.join(os.tmpdir(), 'chromium-ide-gerrit')
  );
  const jsonPath = path.join(tempPath, '/issue.json');
  const result = await commonUtil.exec(
    'git',
    ['cl', 'issue', `--json=${jsonPath}`],
    {
      cwd: gitDir,
      logger: sink,
      logStdout: true,
      env: envForDepotTools(),
    }
  );
  if (result instanceof Error) {
    sink.appendLine(result.toString());
    return [];
  }
  let json: unknown;
  try {
    const jsonText = await fs.readFile(jsonPath, 'utf-8');
    json = JSON.parse(jsonText);
    await fs.rm(jsonPath);
    await fs.rmdir(tempPath);
  } catch (err) {
    sink.appendLine(String(err));
    return [];
  }
  if (
    typeof json !== 'object' ||
    json === null ||
    !('gerrit_project' in json) ||
    typeof json.gerrit_project !== 'string' ||
    !('issue' in json) ||
    typeof json.issue !== 'number'
  ) {
    sink.appendLine(`Unexpected JSON structure: ${JSON.stringify(json)}`);
    return [];
  }
  const changeId = `${json.gerrit_project}~${json.issue}`;

  const headCommitResult = await commonUtil.exec('git', ['rev-parse', 'HEAD'], {
    cwd: gitDir,
    logStdout: true,
    logger: sink,
  });
  if (headCommitResult instanceof Error) {
    sink.appendLine(String(headCommitResult));
    return [];
  }
  return [{changeId, localCommitId: headCommitResult.stdout.trim()}];
}

/**
 * Finds the Git directory for the file
 * or returns undefined with logging when the directory is not found.
 */
export async function findGitDir(
  filePath: string,
  sink: Sink
): Promise<string | undefined> {
  const gitDir = commonUtil.findGitDir(filePath);
  if (!gitDir) {
    sink.appendLine('Git directory not found for ' + filePath);
    return;
  }
  return gitDir;
}

export const TEST_ONLY = {parseDiffHunks, parseGitLog};
