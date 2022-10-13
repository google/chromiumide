// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as path from 'path';
import * as commonUtil from '../common/common_util';

export const GIT_MSG_SCHEME = 'gitmsg';

export class GitDocumentProvider implements vscode.TextDocumentContentProvider {
  cache = new Map<string, string>();

  activate() {
    vscode.workspace.registerTextDocumentContentProvider(GIT_MSG_SCHEME, this);
  }
  private async getCommitMessageCached(
    fsPath: string,
    sha: string
  ): Promise<string> {
    // TODO(ttylenda): Only cache hex SHA, don't cache HEAD, etc.
    // We can cache the commit message based on retrieved SHA
    // (requires changing the format to, for example, %H%n%B).
    let message = this.cache.get(sha);

    if (message) {
      return message;
    }

    const dir = path.dirname(fsPath);
    const result = await getCommitMessage(dir, sha);

    message =
      result instanceof Error ? `Error occured: ${result}` : result.stdout;
    this.cache.set(sha, message);

    return message;
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    return this.getCommitMessageCached(uri.path, uri.query);
  }
}

/**
 * Get description of a commit.
 *
 * Intended for both proving text document content and use as a library function.
 */
export async function getCommitMessage(
  dir: string,
  ref: string
): ReturnType<typeof commonUtil.exec> {
  return commonUtil.exec('git', ['log', '--format=%B', '-n', '1', ref], {
    cwd: dir,
  });
}
