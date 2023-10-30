// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {Metrics} from '../metrics/metrics';

const SCHEME = 'gerrit';

/**
 * Creates a URI to a document for attaching Gerrit patchset level comments.
 * The document contains fixed text, but `dir` is required,
 * because VSCode shows it in tooltips in the comments UI.
 */
export function patchSetUri(dir: string, id: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: SCHEME,
    path: path.join(dir, 'PATCHSET_LEVEL'),
    query: id,
  });
}

/** Virtual document for attaching Gerrit patchset level comments. */
export class GerritDocumentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private subscriptions: vscode.Disposable[] = [];

  constructor() {
    this.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(SCHEME, this)
    );
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    Metrics.send({
      category: 'interactive',
      group: 'virtualdocument',
      description: 'open gerrit document',
      name: 'virtualdocument_open_document',
      // For consistency with git_document, which also send |document|.
      document: 'gerrit patchset level',
    });
    return `Patchset level comments on Change-Id: ${uri.query}`;
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }
}
