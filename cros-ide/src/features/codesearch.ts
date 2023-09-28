// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as path from 'path';
import * as vscode from 'vscode';
import {chromiumRoot} from '../common/chromium/fs';
import * as commonUtil from '../common/common_util';
import {
  vscodeRegisterCommand,
  vscodeRegisterTextEditorCommand,
} from '../common/vscode/commands';
import * as ideUtil from '../ide_util';
import * as config from '../services/config';
import {Metrics} from './metrics/metrics';

export function activate(context: vscode.ExtensionContext): void {
  const openFileCmd = vscodeRegisterTextEditorCommand(
    'chromiumide.codeSearchOpenCurrentFile',
    (textEditor: vscode.TextEditor) => openCurrentFile(textEditor)
  );

  // Used to open files from the explorer sidebar.
  const openFilesCmd = vscodeRegisterCommand(
    'chromiumide.codeSearchOpen',
    // `clickedFile` corresponds to the file in the explorer sidebar that the right-click happened
    // on. `allSelectedFiles` contains all selected files, including `clickedFile`.
    (clickedFile: vscode.Uri, allSelectedFiles: vscode.Uri[]) =>
      void openFiles(allSelectedFiles)
  );

  const copyFileCmd = vscodeRegisterTextEditorCommand(
    'chromiumide.codeSearchCopyCurrentFile',
    (textEditor: vscode.TextEditor) => copyCurrentFile(textEditor)
  );

  const searchSelectionCmd = vscodeRegisterTextEditorCommand(
    'chromiumide.codeSearchSearchForSelection',
    (textEditor: vscode.TextEditor) => searchSelection(textEditor)
  );

  context.subscriptions.push(
    openFileCmd,
    openFilesCmd,
    searchSelectionCmd,
    copyFileCmd
  );
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

async function openCurrentFile(textEditor: vscode.TextEditor): Promise<void> {
  const result = await getCurrentFile(textEditor);
  if (result) {
    void vscode.env.openExternal(vscode.Uri.parse(result));
    Metrics.send({
      category: 'interactive',
      group: 'codesearch',
      name: 'codesearch_open_current_file',
      description: 'open current file',
    });
  }
}

async function openFiles(allSelectedFiles: vscode.Uri[]): Promise<void> {
  const urls = await Promise.all(
    allSelectedFiles.map((uri: vscode.Uri) =>
      getCodeSearchUrl(uri.fsPath, null)
    )
  );
  let opened = false;
  for (const url of urls) {
    if (url) {
      opened = true;
      void vscode.env.openExternal(vscode.Uri.parse(url));
    }
  }
  if (opened) {
    Metrics.send({
      category: 'interactive',
      group: 'codesearch',
      name: 'codesearch_open_files',
      description: 'open files from explorer sidebar',
    });
  }
}

async function copyCurrentFile(textEditor: vscode.TextEditor): Promise<void> {
  const result = await getCurrentFile(textEditor);
  if (result) {
    void vscode.env.clipboard.writeText(result);
    Metrics.send({
      category: 'interactive',
      group: 'codesearch',
      name: 'codesearch_copy_current_file',
      description: 'copy current file',
    });
  }
}

async function getCurrentFile(
  textEditor: vscode.TextEditor
): Promise<string | undefined> {
  const fullpath = textEditor.document.fileName;
  const line = textEditor.selection.active.line + 1;
  return getCodeSearchUrl(fullpath, line);
}

async function getCodeSearchUrl(
  fullpath: string,
  line: number | null
): Promise<string | undefined> {
  const chromium = await chromiumRoot(fullpath);
  if (chromium) {
    const relative = path.relative(chromium + '/src', fullpath);
    let url =
      'https://source.chromium.org/chromium/chromium/src/+/main:' +
      encodeURI(relative);
    if (line !== null) {
      url += `;l=${line}`;
    }
    return url;
  }

  // Which CodeSearch to use, options are public, internal, or gitiles.
  const csInstance = config.codeSearch.instance.get();

  const csHash = config.codeSearch.openWithRevision.get();

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
  opts.push('--show', `--${csInstance}`);
  if (line !== null) {
    opts.push(`--line=${line}`);
  }
  opts.push(fullpath);

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
    Metrics.send({
      category: 'error',
      group: 'codesearch',
      name: 'codesearch_generate_cs_path_failed',
      description: 'generate_cs_path failed',
    });
    return;
  }
  // trimEnd() to get rid of the newline.
  return stdout.trimEnd();
}

// TODO: Figure out if the search should be limited to the current repo.
function searchSelection(textEditor: vscode.TextEditor): void {
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
  Metrics.send({
    category: 'interactive',
    group: 'codesearch',
    description: 'search selection',
    name: 'codesearch_search_selection',
    selected_text: selectedText,
  });
}

export const TEST_ONLY = {
  openCurrentFile,
  openFiles,
  copyCurrentFile,
  searchSelection,
};
