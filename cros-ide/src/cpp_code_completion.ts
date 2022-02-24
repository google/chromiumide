// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as process from 'process';

import * as commonUtil from './common/common_util';
import * as ideUtilities from './ide_utilities';

export function activate(context: vscode.ExtensionContext) {
  const manager = new commonUtil.JobManager<void>();

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(
      editor => {
        if (editor?.document.languageId === 'cpp') {
          generateCompilationDatabase(manager, editor.document);
        }
      },
  ));

  // Update compilation database when a GN file is updated.
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(
      document => {
        if (document.fileName.match(/\.gni?$/)) {
          generateCompilationDatabase(manager, document);
        }
      },
  ));

  const document = vscode.window.activeTextEditor?.document;
  if (document) {
    generateCompilationDatabase(manager, document);
  }
}

// Generate compilation database for clangd.
async function generateCompilationDatabase(
    manager: commonUtil.JobManager<void>,
    document: vscode.TextDocument,
) {
  const project = getProject(document.fileName);
  if (!project) {
    return;
  }
  const board = await ideUtilities.getOrSelectTargetBoard();
  if (!board) {
    return;
  }

  // Below, we create compilation database based on the project and the board.
  // Generating the database is time consuming involving execution of external
  // processes, so we ensure it to run only one at a time using the manager.
  await manager.offer(async () => {
    // TODO(oka): Show that compilation is in progress in status bar.
    try {
      await commonUtil.exec('cros_workon', ['--board', board, 'start', project],
          ideUtilities.getLogger().append);

      await commonUtil.exec('env',
          ['USE=compilation_database', `emerge-${board}`, project],
          ideUtilities.getLogger().append, {logStdout: true});

      // Make the generated compilation database available from clangd.
      await commonUtil.exec(
          'ln', ['-sf', `/build/${board}/build/compilation_database/` +
        `${project}/compile_commands_chroot.json`,
          `${process.env.HOME}/chromiumos/src/platform2/compile_commands.json`],
          ideUtilities.getLogger().append);
    } catch (e) {
      console.error(e);
    }
  });
}

// Get project name from filename.
function getProject(filename: string): string | null {
  return platform2Project(filename);
}

// Known source code location to project name mapping which supports
// compilation database generation.
// TODO(oka): add more entries.
const knownMapping: Map<string, string> = new Map([
  ['cros-disks', 'chromeos-base/cros-disks'],
  ['shill', 'chromeos-base/shill'],
]);

const platform2 = '/platform2/';

// Get platform2 project or return null.
function platform2Project(filepath: string): string | null {
  const i = filepath.indexOf(platform2);
  if (i === -1) {
    return null;
  }
  const directory = filepath.substring(i + platform2.length).split('/')[0];
  return knownMapping.get(directory) || null;
}
