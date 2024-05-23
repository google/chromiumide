// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../shared/app/common/common_util';
import * as config from '../../../shared/app/services/config';
import {CppXrefs} from '../../common/cpp_xrefs/cpp_xrefs';
import {
  CompdbGeneratorCore,
  GenerationScope,
  GenericCompdbGenerator,
} from '../../common/cpp_xrefs/generic_compdb_generator';
import {ErrorDetails} from '../../common/cpp_xrefs/types';

/**
 * Activates chromium C++ xrefs support.
 */
export class ChromiumCppXrefs {
  /**
   * @param chromiumRoot chromium repository's root in which the `src` directory exists.
   */
  constructor(chromiumRoot: string, cppXrefs: CppXrefs) {
    cppXrefs.register(
      output =>
        new GenericCompdbGenerator(
          new ChromiumCompdbGenerator(chromiumRoot, output)
        )
    );
  }
}

class ChromiumCompdbGenerator implements CompdbGeneratorCore {
  constructor(
    private readonly chromiumRoot: string,
    private readonly output: vscode.OutputChannel
  ) {}

  readonly name = 'chromium';

  async generationScope(
    document: vscode.TextDocument
  ): Promise<GenerationScope> {
    // Rebuild when a GN file is edited.
    if (document.languageId === 'gn') {
      return GenerationScope.Always;
    }

    if (!['c', 'cpp'].includes(document.languageId)) {
      return GenerationScope.Unsupported;
    }
    return GenerationScope.InitOnly;
  }

  async compdbPath(_document: vscode.TextDocument): Promise<string> {
    return path.join(this.chromiumRoot, 'src/compile_commands.json');
  }

  async generate(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<undefined | ErrorDetails | vscode.CancellationError> {
    const compdbPath = await this.compdbPath(document);

    const result = await this.generateInner(compdbPath, token);
    if (result instanceof Error) {
      return result;
    }

    const folderToOpen = path.dirname(compdbPath);
    const workspaceHasCompdb = vscode.workspace.workspaceFolders?.find(
      folder => folder.uri.fsPath === folderToOpen
    );

    if (workspaceHasCompdb) {
      return;
    }

    if (config.cppXrefs.suggestWorkspaceFolder.get()) {
      void (async () => {
        const choice = await vscode.window.showWarningMessage(
          `Compilation database has been generated in ${compdbPath}, but no workspace folders contain the file to provide C++ xrefs`,
          'Open src',
          "Don't show again"
        );
        if (choice === 'Open src') {
          const src = vscode.Uri.file(path.join(this.chromiumRoot, 'src'));
          await vscode.commands.executeCommand('vscode.openFolder', src);
        } else if (choice === "Don't show again") {
          await config.cppXrefs.suggestWorkspaceFolder.update(false);
        }
      })();
    }
  }

  private async generateInner(
    compdbPath: string,
    token: vscode.CancellationToken
  ): Promise<undefined | ErrorDetails> {
    const currentLink = path.join(this.chromiumRoot, 'src/out/current_link');
    if (!fs.existsSync(currentLink)) {
      const doc = 'http://go/chromiumide-doc-chromium';
      return new ErrorDetails(
        'out dir not exist',
        `out/current_link does not exist; see [our guide](${doc}) for set up instructions`
      );
    }

    // Execute the command written on
    // https://chromium.googlesource.com/chromium/src/+/HEAD/docs/clangd.md.
    const exe = path.join(
      this.chromiumRoot,
      'src/tools/clang/scripts/generate_compdb.py'
    );
    const result = await commonUtil.exec(
      exe,
      ['-p', 'out/current_link', '-o', compdbPath],
      {
        cancellationToken: token,
        cwd: path.join(this.chromiumRoot, 'src'),
        logger: this.output,
      }
    );
    if (result instanceof Error) {
      return new ErrorDetails(
        'command failure',
        `Command to generate compilation database failed: ${result.message}`
      );
    }
  }
}
