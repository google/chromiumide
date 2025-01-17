// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {
  DidOpenTextDocumentNotification,
  DidOpenTextDocumentParams,
  SymbolInformation,
  WorkspaceSymbolParams,
  WorkspaceSymbolRequest,
} from 'vscode-languageclient';
import {vscodeRegisterCommand} from '../../../../shared/app/common/vscode/commands';
import type {ClangdExtension} from '@clangd/vscode-clangd';

export const COMMAND_SHOW_LOGS = 'chromiumide.chromium.java.showLogs';
export const COMMAND_JNI_ZERO_GO_TO_DEFINITION =
  'chromiumide.chromium.java.jniZero.gotoDefinition';

export function registerCommands(
  context: vscode.ExtensionContext,
  srcDir: string,
  output: vscode.OutputChannel
): void {
  context.subscriptions.push(
    vscodeRegisterCommand(COMMAND_SHOW_LOGS, () => {
      output.show();
    }),

    vscodeRegisterCommand(
      COMMAND_JNI_ZERO_GO_TO_DEFINITION,
      async (className: string, upperMethodName: string) => {
        // Activate the clangd extension if not yet.
        const extension = vscode.extensions.getExtension<ClangdExtension>(
          'llvm-vs-code-extensions.vscode-clangd'
        );
        if (!extension) {
          void vscode.window.showErrorMessage('Clangd extension not installed');
          return;
        }

        // See https://github.com/clangd/vscode-clangd/tree/HEAD/api for the API documentation.
        const api = await extension.activate();
        const {languageClient} = api.getApi(1);
        if (!languageClient) {
          void vscode.window.showErrorMessage(
            'Clangd language client unavailable'
          );
          return;
        }

        // HACK: Pretend to open a fake C++ document to force clangd to activate the background
        // index. Without this hack, clangd returns no results for workspace/symbol if the user has
        // not opened any C++ files in the editor.
        await languageClient.sendNotification(
          DidOpenTextDocumentNotification.method,
          {
            textDocument: {
              uri: vscode.Uri.file(
                path.join(srcDir, '_', 'enforce_background_index.cc')
              ).toString(),
              languageId: 'cpp',
              version: 1,
              text: '',
            },
          } as DidOpenTextDocumentParams
        );

        // Try two possible symbols.
        const queries = [
          `JNI_${className}_${upperMethodName}`,
          `${className}::${upperMethodName}`,
        ];
        for (const query of queries) {
          // Ideally we should use the typed overload with WorkspaceSymbolRequest.type, but
          // it does not pass the type check because of the version difference of
          // vscode-languageclient.
          const symbols = await languageClient.sendRequest<
            SymbolInformation[] | null
          >(WorkspaceSymbolRequest.method, {query} as WorkspaceSymbolParams);
          if (symbols && symbols.length >= 1) {
            const symbol = symbols[0];
            await vscode.commands.executeCommand(
              'vscode.open',
              vscode.Uri.parse(symbol.location.uri),
              {selection: symbol.location.range}
            );
            return;
          }
        }

        void vscode.window.showErrorMessage('JNI implementation not found');
      }
    )
  );
}
