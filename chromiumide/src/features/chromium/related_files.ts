// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {vscodeRegisterCommand} from '../../common/vscode/commands';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      {scheme: 'file', language: 'cpp'},
      new RelatedFilesProvider()
    )
  );
  context.subscriptions.push(
    vscodeRegisterCommand(
      'chromiumide.relatedFiles.create',
      async (uri: unknown) => {
        if (!(uri instanceof vscode.Uri)) {
          return;
        }
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.createFile(uri, {
          ignoreIfExists: true,
          overwrite: false,
        });
        const success = await vscode.workspace.applyEdit(workspaceEdit);
        if (!success) {
          return vscode.window.showErrorMessage(
            `Unable to create related file: ${uri}.`
          );
        }
        return vscode.commands.executeCommand('vscode.open', uri);
      }
    )
  );
}

class RelatedFileCodeLens extends vscode.CodeLens {
  constructor(
    range: vscode.Range,
    readonly title: string,
    readonly uri: vscode.Uri
  ) {
    super(range);
  }
}

class RelatedFilesProvider
  implements vscode.CodeLensProvider<RelatedFileCodeLens>
{
  private static readonly RELATED_FILE_TEMPLATES = [
    {suffix: '.h', title: '.h file'},
    {suffix: '.cc', title: '.cc file'},
    {suffix: '_unittest.cc', title: 'unit test'},
    {suffix: '_browsertest.cc', title: 'browser test'},
  ];

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<RelatedFileCodeLens[]> {
    if (
      !document.fileName.endsWith('.h') &&
      !document.fileName.endsWith('.cc')
    ) {
      return [];
    }

    const fileNameParts = path.parse(document.fileName);
    let fileNameBase = fileNameParts.name;
    for (const suffix of ['_test', '_unittest', '_browsertest']) {
      if (fileNameBase.endsWith(suffix)) {
        fileNameBase = fileNameBase.slice(0, -suffix.length);
        break;
      }
    }

    return RelatedFilesProvider.RELATED_FILE_TEMPLATES.flatMap(
      ({suffix, title}) => {
        const uri = vscode.Uri.file(
          path.join(fileNameParts.dir, `${fileNameBase}${suffix}`)
        );
        if (uri.fsPath === document.uri.fsPath) {
          // Skip a code lens that would point to the file itself.
          return [];
        }
        return new RelatedFileCodeLens(
          new vscode.Range(0, 0, 0, Number.MAX_SAFE_INTEGER),
          title,
          uri
        );
      }
    );
  }

  async resolveCodeLens(
    codeLens: RelatedFileCodeLens,
    _token: vscode.CancellationToken
  ): Promise<RelatedFileCodeLens | undefined> {
    if (await this.isFile(codeLens.uri)) {
      codeLens.command = {
        command: 'vscode.open',
        title: `Open ${codeLens.title}`,
        arguments: [codeLens.uri],
      };
      return;
    }

    codeLens.command = {
      command: 'chromiumide.relatedFiles.create',
      title: `Add ${codeLens.title}`,
      arguments: [codeLens.uri],
    };
    return codeLens;
  }

  private async isFile(uri: vscode.Uri) {
    let stat: vscode.FileStat;
    try {
      stat = await vscode.workspace.fs.stat(uri);
    } catch (error) {
      // The file does not exist.
      return false;
    }

    return stat.type === vscode.FileType.File;
  }
}

export const TEST_ONLY = {
  RelatedFilesProvider,
  RelatedFileCodeLens,
};
