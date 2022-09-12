// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../common/common_util';
import * as config from '../services/config';
import * as ideUtil from '../ide_util';
import * as metrics from './metrics/metrics';

export function activate(context: vscode.ExtensionContext) {
  const openFileCmd = vscode.commands.registerTextEditorCommand(
    'cros-ide.codeSearchOpenCurrentFile',
    (textEditor: vscode.TextEditor) => void openCurrentFile(textEditor)
  );

  const copyFileCmd = vscode.commands.registerTextEditorCommand(
    'cros-ide.codeSearchCopyCurrentFile',
    (textEditor: vscode.TextEditor) => void copyCurrentFile(textEditor)
  );

  const searchSelectionCmd = vscode.commands.registerTextEditorCommand(
    'cros-ide.codeSearchSearchForSelection',
    (textEditor: vscode.TextEditor) => searchSelection(textEditor)
  );

  context.subscriptions.push(openFileCmd, searchSelectionCmd, copyFileCmd);
}

function getCodeSearchToolConfig(
  fullpath: string
): {executable: string; cwd: string} | undefined {
  const chroot = commonUtil.findChroot(fullpath);
  if (!chroot) {
    return undefined;
  }
  const source = commonUtil.sourceDir(chroot);
  return {
    executable: path.join(source, 'chromite/contrib/generate_cs_path'),
    cwd: chroot,
  };
}

async function openCurrentFile(textEditor: vscode.TextEditor) {
  const result = await getCurrentFile(textEditor);
  if (result) {
    void vscode.env.openExternal(vscode.Uri.parse(result));
    metrics.send({
      category: 'interactive',
      group: 'codesearch',
      action: 'open current file',
    });
  }
}

async function copyCurrentFile(textEditor: vscode.TextEditor) {
  const result = await getCurrentFile(textEditor);
  if (result) {
    void vscode.env.clipboard.writeText(result);
    metrics.send({
      category: 'interactive',
      group: 'codesearch',
      action: 'copy current file',
    });
  }
}

async function getCurrentFile(
  textEditor: vscode.TextEditor
): Promise<string | undefined> {
  const fullpath = textEditor.document.fileName;

  // Which CodeSearch to use, options are public, internal, or gitiles.
  const csInstance = config.codeSearch.instance.get();

  const csHash = config.codeSearch.openWithRevision.get();

  const line = textEditor.selection.active.line + 1;

  const csConfig = getCodeSearchToolConfig(fullpath);
  if (!csConfig) {
    void vscode.window.showErrorMessage(
      "Could not find 'generate_cs_path' script"
    );
    return;
  }
  const {executable, cwd} = csConfig;

  const opts = [];
  if (csHash) {
    opts.push('--upstream-sha');
  }
  opts.push('--show', `--${csInstance}`, `--line=${line}`, fullpath);

  const res = await commonUtil.exec(executable, opts, {
    logger: ideUtil.getUiLogger(),
    logStdout: true,
    ignoreNonZeroExit: true,
    cwd: cwd,
  });

  if (res instanceof Error) {
    void vscode.window.showErrorMessage(
      'Could not run generate_cs_path: ' + res
    );
    return;
  }

  const {exitStatus, stdout, stderr} = res;
  if (exitStatus) {
    void vscode.window.showErrorMessage(
      `generate_cs_path returned an error: ${stderr}`
    );
    metrics.send({
      category: 'error',
      group: 'codesearch',
      description: 'generate_cs_path failed',
    });
    return;
  }
  // trimEnd() to get rid of the newline.
  return stdout.trimEnd();
}

// TODO: Figure out if the search should be limited to the current repo.
function searchSelection(textEditor: vscode.TextEditor) {
  if (textEditor.selection.isEmpty) {
    return;
  }

  // If the setting is gitiles, we use public CodeSearch
  const csInstance = config.codeSearch.instance.get();
  const csBase =
    csInstance === 'internal'
      ? 'https://source.corp.google.com/'
      : 'https://source.chromium.org/';

  const selectedText = textEditor.document.getText(textEditor.selection);
  const uri = vscode.Uri.parse(csBase).with({
    path: '/search',
    query: `q=${selectedText}`,
  });
  void vscode.env.openExternal(uri);
  metrics.send({
    category: 'interactive',
    group: 'codesearch',
    action: 'search selection',
    label: selectedText,
  });
}

export const TEST_ONLY = {
  openCurrentFile,
  searchSelection,
};
