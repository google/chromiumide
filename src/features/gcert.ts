// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../shared/app/common/driver_repository';
import {vscodeRegisterCommand} from '../../shared/app/common/vscode/commands';
import {ensureOrRunGcert} from '../common/gcert';

const driver = getDriver();

/**
 * Enables command to run gcert.
 */
export class Gcert implements vscode.Disposable {
  private readonly onDidRunEmitter = new vscode.EventEmitter<void>();
  readonly onDidRun = this.onDidRunEmitter.event;

  private readonly subscriptions = [
    this.onDidRunEmitter,
    vscodeRegisterCommand('chromiumide.gcert.run', async () => {
      await this.run();
      this.onDidRunEmitter.fire();
    }),
  ];

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly tempDir = '/tmp',
    private readonly syslogPath = '/var/log/messages'
  ) {}

  private async run() {
    driver.metrics.send({
      group: 'gcert',
      category: 'interactive',
      description: 'running gcert is requested',
      name: 'gcert_run',
    });

    await ensureOrRunGcert(
      {
        force: true,
        logger: this.output,
      },
      this.tempDir,
      this.syslogPath
    );
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.splice(0)).dispose();
  }
}
