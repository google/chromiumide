// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as childProcess from 'child_process';
import * as ideUtilities from './ide_utilities';
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

const generateCsPath = '~/chromiumos/chromite/contrib/generate_cs_path';

function openCurrentFile(textEditor: vscode.TextEditor) {
  const fullpath = textEditor.document.fileName;

  // Which CodeSearch to use, options are public, internal, or gitiles.
  const csInstance = ideUtilities.getConfigRoot().get<string>('codesearch');

  const line = textEditor.selection.active.line + 1;

  // generate_cs_path is a symlink that uses a wrapper to call a Python script,
  // so it seems we need exec(), which spawn a shell.
  childProcess.exec(
      `${generateCsPath} --show "--${csInstance}" --line=${line} "${fullpath}"`,
      (error, stdout, stderr) => {
        if (error) {
          console.log(stderr);
          return;
        }
        // trimEnd() to get rid of the newline.
        vscode.env.openExternal(vscode.Uri.parse(stdout.trimEnd()));
      },
  );
}

// TODO: Figure out if the search should be limited to the current repo.
function searchSelection(textEditor: vscode.TextEditor) {
  if (textEditor.selection.isEmpty) {
    return;
  }

  // If the setting is gitiles, we use public CodeSearch
  const csInstance = ideUtilities.getConfigRoot().get<string>('codesearch');
  const csBase =
    csInstance == 'internal' ?
        'https://source.corp.google.com/' : 'https://source.chromium.org/';

  const selectedText = textEditor.document.getText(textEditor.selection);
  const uri =
      vscode.Uri.parse(csBase)
          .with({path: '/search', query: `q=${selectedText}`});
  vscode.env.openExternal(uri);
}
