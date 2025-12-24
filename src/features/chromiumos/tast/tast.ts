// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {
  StatusManager,
  TaskStatus,
} from '../../../../shared/app/ui/bg_task_status';
import * as services from '../../../services';
import {TastTests} from './tast_tests';

export class Tast implements vscode.Disposable {
  private wrappedOutput?: vscode.OutputChannel;
  private get output(): vscode.OutputChannel {
    if (!this.wrappedOutput) {
      this.wrappedOutput = vscode.window.createOutputChannel('Tast');
      this.subscriptions.push(this.wrappedOutput);

      this.statusManager.setTask('Tast', {
        status: TaskStatus.OK,
        outputChannel: this.wrappedOutput,
      });
    }
    return this.wrappedOutput;
  }

  private readonly subscriptions: vscode.Disposable[] = [];

  private tastTests?: TastTests;

  constructor(
    chrootService: services.chromiumos.ChrootService,
    gitDirsWatcher: services.GitDirsWatcher,
    private readonly statusManager: StatusManager
  ) {
    this.subscriptions.push(
      gitDirsWatcher.onDidChangeVisibleGitDirs(e => {
        if (e.added.find(isTastTests)) {
          this.tastTests?.dispose();
          this.tastTests = new TastTests(chrootService, this.output);
          void this.tastTests.initialize();
        }
        if (e.removed.find(isTastTests)) {
          this.tastTests?.dispose();
        }
      })
    );

    if (gitDirsWatcher.visibleGitDirs.find(isTastTests)) {
      this.tastTests = new TastTests(chrootService, this.output);
      void this.tastTests.initialize();
    }
  }

  dispose(): void {
    this.tastTests?.dispose();
    vscode.Disposable.from(...this.subscriptions.reverse()).dispose();
  }
}

function isTastTests(gitDir: string) {
  return gitDir.endsWith('/src/platform/tast-tests');
}
