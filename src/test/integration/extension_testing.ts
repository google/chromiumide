// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as extension from '../../extension';

/**
 * ExtensionApiForTesting is similar to ExtensionApi, but some fields are
 * guaranteed to be available.
 */
interface ExtensionApiForTesting extends extension.ExtensionApi {
  context: vscode.ExtensionContext;
}

/**
 * Activates the extension and returns its public API.
 */
export async function activateExtension(): Promise<ExtensionApiForTesting> {
  const extension =
    vscode.extensions.getExtension<ExtensionApiForTesting>('google.cros-ide')!;
  return await extension.activate();
}

export async function closeDocument(
  document: vscode.TextDocument
): Promise<void> {
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}
