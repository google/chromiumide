// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../shared/app/common/driver_repository';

const driver = getDriver();

type Instruction = {
  suggestMigration: boolean;
};

/**
 * Provides logic that runs only on code-server. This class is used to migrate code-server users to
 * use VSCode.
 */
export class CodeServer implements vscode.Disposable {
  private readonly onDidRunEmitter = new vscode.EventEmitter<Instruction>();
  /**
   * Fired after everything this class should do has been done with an object representing what has
   * been done.
   */
  readonly onDidRun = this.onDidRunEmitter.event;

  constructor() {
    const instruction = {
      suggestMigration: isCodeServer(),
    };

    // Delay activation to allow tests to subscribe to events.
    setImmediate(() => {
      void this.run(instruction);
    });
  }

  private async run(instruction: Instruction) {
    if (instruction.suggestMigration) {
      await this.suggestMigration();
    }
    this.onDidRunEmitter.fire(instruction);
  }

  /** Shows a message to suggest migration. It blocks until the user responds to the message. */
  private async suggestMigration() {
    const PSA = 'http://g/chromiumide-users/c/UJ_ynJ8393Y/m/6mhv6BxWAgAJ';
    const GUIDE = 'http://go/chromiumide-on-chromebooks';
    const OPEN_GUIDE = 'Open guide';

    const choice = await vscode.window.showErrorMessage(
      `ChromiumIDE: code-server support will be deprecated ([PSA](${PSA})), and new releases of the extension will not be available on OpenVSX Marketplace for code-server starting from the next release. Please switch to VSCode following our [guide](${GUIDE}).`,
      OPEN_GUIDE,
      'Notify later'
    );
    if (choice === OPEN_GUIDE) {
      driver.metrics.send({
        group: 'code_server',
        category: 'interactive',
        name: 'code_server_migration_open_guide',
        description: 'Open guide to migrate to VSCode',
      });
      await vscode.env.openExternal(vscode.Uri.parse(GUIDE));
    }
  }

  dispose(): void {
    this.onDidRunEmitter.dispose();
  }
}

function isCodeServer(): boolean {
  return vscode.env.appName.toLowerCase() === 'code-server';
}
