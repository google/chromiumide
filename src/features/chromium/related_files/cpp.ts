// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';

export class CppRelatedFileCodeLens extends vscode.CodeLens {
  constructor(
    range: vscode.Range,
    readonly title: string,
    readonly uri: vscode.Uri
  ) {
    super(range);
  }
}

export class CppRelatedFilesProvider
  implements vscode.CodeLensProvider<CppRelatedFileCodeLens>
{
  static documentSelector(srcDir: string): vscode.DocumentSelector {
    return [
      // Not to match anything under src/out.
      {scheme: 'file', language: 'cpp', pattern: `${srcDir}/[!o]*/**`},
      {scheme: 'file', language: 'cpp', pattern: `${srcDir}/o[!u]*/**`},
      {scheme: 'file', language: 'cpp', pattern: `${srcDir}/ou[!t]*/**`},
    ];
  }

  static activate(srcDir: string): vscode.Disposable {
    return vscode.languages.registerCodeLensProvider(
      CppRelatedFilesProvider.documentSelector(srcDir),
      new CppRelatedFilesProvider()
    );
  }

  private static readonly RELATED_FILE_TEMPLATES = [
    {suffix: '.h', title: '.h file'},
    {suffix: '.cc', title: '.cc file'},
    {suffix: '_unittest.cc', title: 'unit test'},
    {suffix: '_browsertest.cc', title: 'browser test'},
  ];

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<CppRelatedFileCodeLens[]> {
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

    return CppRelatedFilesProvider.RELATED_FILE_TEMPLATES.flatMap(
      ({suffix, title}) => {
        const uri = vscode.Uri.file(
          path.join(fileNameParts.dir, `${fileNameBase}${suffix}`)
        );
        if (uri.fsPath === document.uri.fsPath) {
          // Skip a code lens that would point to the file itself.
          return [];
        }
        return new CppRelatedFileCodeLens(
          new vscode.Range(0, 0, 0, Number.MAX_SAFE_INTEGER),
          title,
          uri
        );
      }
    );
  }

  async resolveCodeLens(
    codeLens: CppRelatedFileCodeLens,
    _token: vscode.CancellationToken
  ): Promise<CppRelatedFileCodeLens | undefined> {
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
