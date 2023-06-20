// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as commonUtil from '../../common/common_util';
import * as git from './git';
import {Sink} from './sink';

// The implementation here is largely based on depot_tools/gerrit_util.py

/** Reads gitcookies or returns undefined. */
export async function readAuthCookie(
  repoId: git.RepoId,
  sink: Sink
): Promise<string | undefined> {
  const filePath = await getGitcookiesPath(sink);
  try {
    sink.appendLine(`Parsing ${filePath} to access ${repoId} Gerrit`);
    const str = await fs.promises.readFile(filePath, {encoding: 'utf8'});
    const res = parseAuthGitcookies(repoId, str);
    if (res === undefined) {
      sink.appendLine('Gerrit credential not found');
    }
    return res;
  } catch (err) {
    if ((err as {code?: unknown}).code === 'ENOENT') {
      const msg =
        'The gitcookies file for Gerrit auth was not found at ' + filePath;
      sink.show(msg);
    } else {
      let msg =
        'Unknown error in reading the gitcookies file for Gerrit auth at ' +
        filePath;
      if (err instanceof Object) msg += ': ' + err.toString();
      sink.show(msg);
    }
  }
}

/** Get the path of the gitcookies */
async function getGitcookiesPath(sink: Sink): Promise<string> {
  // Use the environment variable GIT_COOKIES_PATH if it exists
  const envPath = process.env.GIT_COOKIES_PATH;
  if (envPath) return envPath;
  // Use the output of git config --path http.cookiefile
  const gitPath = await commonUtil.exec('git', [
    'config',
    '--path',
    'http.cookiefile',
  ]);
  if (gitPath instanceof Error) {
    sink.appendLine(
      '"git config --path http.cookiefile" failed, so we use ~/.gitcookies'
    );
    // Use ~/.gitcookies
    return path.join(os.homedir(), '.gitcookies');
  }
  return gitPath.stdout.trimEnd();
}

/**
 * Parse the gitcookies to get the cookie for
 * authentication on the Gerrit repository of `repoId`.
 **/
function parseAuthGitcookies(
  repoId: git.RepoId,
  gitcookies: string
): string | undefined {
  // We return the last match in the cookies
  // (by iterating over the lines backward with `.reverse()`),
  // because we want to get the newest auth token.
  for (const line of gitcookies.split('\n').reverse()) {
    // Skip if the line starts with #
    if (line[0] === '#') continue;
    // Split the line into fields by tab
    const fields = line.split('\t');
    // Skip if not with 7 fields
    if (fields.length !== 7) continue;
    // Set the result if the line has the cookie `o` with the
    // authentication token, for the Gerrit domain of `repoId`
    if (`https://${fields[0]}` === git.gerritUrl(repoId) && fields[5] === 'o') {
      return `o=${fields[6]}`;
    }
  }
}

export const TEST_ONLY = {parseAuthGitcookies};
