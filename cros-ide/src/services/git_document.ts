// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import {Metrics} from '../features/metrics/metrics';

const GIT_MSG_SCHEME = 'gitmsg';
const COMMIT_MESSAGE = 'COMMIT MESSAGE';

/**
 * Creates a URI for which GitDocumentProvider provides a document containing
 * the commit message of the specified revision. The dir should be a directory
 * containing a git repository and the ref should be a revision
 * in the repository (for example, SHA or 'HEAD'). `feature` is used to identify
 * the origin of the Uri in metrics.
 */
export function commitMessageUri(
  dir: string,
  ref: string,
  feature: string
): vscode.Uri {
  return vscode.Uri.from({
    scheme: GIT_MSG_SCHEME,
    path: path.join(dir, COMMIT_MESSAGE),
    query: ref,
    fragment: feature,
  });
}

export class GitDocumentProvider implements vscode.TextDocumentContentProvider {
  cache = new Map<string, string>();

  activate(): void {
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
    const file = path.basename(uri.path);

    Metrics.send({
      category: 'interactive',
      group: 'virtualdocument',
      description: 'open git document',
      name: 'virtualdocument_open_document',
      document: uri.fragment,
    });

    if (file === COMMIT_MESSAGE) {
      return this.getCommitMessageCached(uri.path, uri.query);
    }

    return `Internal error in ChromiumIDE.\nReport it at http://go/chromiumide-new-bug\n\nURI: ${uri}\n`;
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
