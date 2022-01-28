// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const openFileCmd =
    vscode.commands.registerTextEditorCommand(
        'cros-ide.codeSearchOpenCurrentFile',
        openCurrentFile);

  const searchSelectionCmd = vscode.commands.registerTextEditorCommand(
      'cros-ide.codeSearchSearchForSelection',
      searchSelection);

  context.subscriptions.push(openFileCmd, searchSelectionCmd);
}

function csUri(change: {path?: string, query?: string}): vscode.Uri {
  return vscode.Uri.parse('https://source.chromium.org/').with(change);
}

const chromiumos = '/chromiumos/';

function openCurrentFile(textEditor: vscode.TextEditor) {
  const fullpath = textEditor.document.fileName;
  const relative =
      fullpath.substring(fullpath.indexOf(chromiumos) + chromiumos.length);
  vscode.env.openExternal(
      csUri({path: 'chromiumos/chromiumos/codesearch/+/main:' + relative}));
}

function searchSelection(textEditor: vscode.TextEditor) {
  if (textEditor.selection.isEmpty) {
    return;
  }

  const selectedText = textEditor.document.getText(textEditor.selection);
  vscode.env.openExternal(csUri({path: '/search', query: `q=${selectedText}`}));
}
