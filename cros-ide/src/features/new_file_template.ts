// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';

export class NewFileTemplate implements vscode.Disposable {
  private readonly subscriptions = [
    vscode.workspace.onDidCreateFiles(e => {
      for (const f of e.files) {
        void this.handle(f);
      }
    }),
  ];
  private shownError = false;

  constructor() {}

  dispose() {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }

  private async handle(uri: vscode.Uri) {
    const document = await vscode.workspace.openTextDocument(uri);
    const text = textToInsert(document.languageId);
    if (!text) {
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(0, 0), text);
    const success = await vscode.workspace.applyEdit(edit);
    if (!success && !this.shownError) {
      this.shownError = true;
      await vscode.window.showErrorMessage(
        `Internal error: failed to add template for ${uri}`
      );
      return;
    }
  }
}

const YEAR = '%YEAR%';

const TEMPLATE_SLASH_COMMENT = `// Copyright ${YEAR} The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

`;

const TEMPLATE_HASH_COMMENT = `# Copyright ${YEAR} The ChromiumOS Authors
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

`;

function fillTemplate(template: string) {
  return template.replace(YEAR, '' + new Date().getFullYear());
}

const SLASH_COMMENT_LANGUAGES = new Set([
  'cpp',
  'go',
  'javascript',
  'rust',
  'typescript',
]);

const HASH_COMMENT_LANGUAGES = new Set(['gn', 'python', 'shellscript']);

function textToInsert(languageId: string): string | undefined {
  if (SLASH_COMMENT_LANGUAGES.has(languageId)) {
    return fillTemplate(TEMPLATE_SLASH_COMMENT);
  }
  if (HASH_COMMENT_LANGUAGES.has(languageId)) {
    return fillTemplate(TEMPLATE_HASH_COMMENT);
  }
}

export const TEST_ONLY = {
  textToInsert,
};
