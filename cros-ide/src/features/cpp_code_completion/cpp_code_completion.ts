// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import * as ideUtil from '../../ide_util';
import * as bgTaskStatus from '../../ui/bg_task_status';
import {CompdbService, CompdbServiceImpl} from './compdb_service';
import {SHOW_LOG_COMMAND} from './constants';
import {Packages} from './packages';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager
) {
  const log = vscode.window.createOutputChannel('CrOS IDE: C++ Support');
  vscode.commands.registerCommand(SHOW_LOG_COMMAND.command, () => log.show());

  context.subscriptions.push(
    new CompilationDatabase(
      statusManager,
      new Packages(),
      log,
      new CompdbServiceImpl(statusManager, log)
    )
  );
}

const STATUS_BAR_TASK_ID = 'C++ Support';

export class CompilationDatabase implements vscode.Disposable {
  private readonly jobManager = new commonUtil.JobManager<void>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly statusManager: bgTaskStatus.StatusManager,
    private readonly packages: Packages,
    private readonly log: vscode.OutputChannel,
    private readonly compdbService: CompdbService
  ) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor?.document.languageId === 'cpp') {
          this.generate(editor.document);
        }
      })
    );

    // Update compilation database when a GN file is updated.
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(document => {
        if (document.fileName.match(/\.gni?$/)) {
          this.generate(document);
        }
      })
    );

    const document = vscode.window.activeTextEditor?.document;
    if (document) {
      this.generate(document);
    }
  }

  dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // Generate compilation database for clangd.
  private async generate(document: vscode.TextDocument) {
    if (!this.compdbService.isEnabled()) {
      return;
    }
    const packageInfo = await this.packages.fromFilepath(document.fileName);
    if (!packageInfo) {
      return;
    }

    const board = await ideUtil.getOrSelectTargetBoard();
    if (board instanceof ideUtil.NoBoardError) {
      await vscode.window.showErrorMessage(
        `Generate compilation database: ${board.message}`
      );
      return;
    } else if (board === null) {
      return;
    }

    // Below, we create compilation database based on the project and the board.
    // Generating the database is time consuming involving execution of external
    // processes, so we ensure it to run only one at a time using the manager.
    await this.jobManager.offer(async () => {
      if (!this.compdbService.isEnabled()) {
        return; // early return from queued job.
      }
      try {
        await this.compdbService.generate(board, packageInfo);
      } catch (e) {
        this.log.appendLine((e as Error).message);
        console.error(e);
        this.statusManager.setTask(STATUS_BAR_TASK_ID, {
          status: bgTaskStatus.TaskStatus.ERROR,
          command: SHOW_LOG_COMMAND,
        });
        return;
      }
      this.statusManager.setTask(STATUS_BAR_TASK_ID, {
        status: bgTaskStatus.TaskStatus.OK,
        command: SHOW_LOG_COMMAND,
      });
    });
  }
}
