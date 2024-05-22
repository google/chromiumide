// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';
import * as dateFns from 'date-fns';
import glob from 'glob';
import * as commonUtil from '../../shared/app/common/common_util';
import {escapeArray} from '../../shared/app/common/shutil';
import {assertNever} from '../../shared/app/common/typecheck';
import {vscodeRegisterCommand} from '../../shared/app/common/vscode/commands';

// http://go/gcertstatus#scripting-with-gcertstatus
enum Gcertstatus {
  Success = 0,
  GenericFailure = 1,
  Invalid = 5,
  Expired = 9,
  NotFound = 90,
  ExpireSoon = 91,
}

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
    private readonly tempDir = '/tmp'
  ) {}

  private async run() {
    let sshAuthSock: undefined | string;
    const status = await this.runGcertstatus();
    switch (status) {
      case Gcertstatus.Success:
      case Gcertstatus.ExpireSoon:
      case Gcertstatus.Expired:
      case Gcertstatus.Invalid:
        break; // run gcert
      case Gcertstatus.GenericFailure:
        this.output.show();
        void vscode.window.showErrorMessage(
          'gcertstatus failed with code 1; cannot recover'
        );
        return;
      case Gcertstatus.NotFound: {
        sshAuthSock = await this.askSshAuthSock();
        if (!sshAuthSock) return;
        break;
      }
      default:
        assertNever(status);
    }

    await this.runGcert(sshAuthSock);
  }

  /**
   * Lets the user select SSH_AUTH_SOCK if there are multiple candidates.
   * If there is only one candidate, it returns the value without asking.
   */
  private async askSshAuthSock(): Promise<string | undefined> {
    const cands = await util.promisify(glob)(
      path.join(this.tempDir, 'ssh-*/agent.*')
    );

    if (cands.length === 0) {
      void vscode.window.showErrorMessage('No SSH session found');
      return;
    }
    if (cands.length === 1) {
      return cands[0];
    }

    const items: (vscode.QuickPickItem & {durationMs: number})[] =
      await Promise.all(
        cands.map(async cand => {
          const mtime = await fs.promises
            .stat(cand)
            .then(stat => stat.mtime)
            .catch(() => new Date(0));

          // Show duration rather than the mtime, because client and server timezone
          // might differ.
          const duration = dateFns.intervalToDuration({
            start: mtime,
            end: new Date(),
          });
          const durationStr =
            (duration.days ? `${duration.days} days ` : '') +
              dateFns.formatDuration(duration, {
                format: ['hours', 'minutes'],
                zero: false,
              }) || '0 minutes';
          const description = durationStr + ' ago';

          return {
            label: cand,
            description,
            durationMs: dateFns.milliseconds(duration),
          };
        })
      );
    items.sort((a, b) => a.durationMs - b.durationMs);

    const choice = await vscode.window.showQuickPick(items, {
      title: 'Select SSH_AUTH_SOCK to use to run gcert',
    });

    if (!choice) {
      void (async () => {
        const url = 'http://go/chromiumide-doc-gcert-ssh-auth-sock';
        const choice = await vscode.window.showErrorMessage(
          `gcert: not run because SSU_AUTH_SOCK selector was dismissed; see [our guide](${url}) to learn which to select`,
          'Open Guide'
        );
        if (choice) {
          await vscode.env.openExternal(vscode.Uri.parse(url));
        }
      })();
    }

    return choice?.label;
  }

  private async runGcertstatus(): Promise<Gcertstatus> {
    const result = await commonUtil.exec('gcertstatus', [], {
      logger: this.output,
      ignoreNonZeroExit: true,
    });
    if (result instanceof Error) {
      return Gcertstatus.GenericFailure;
    }
    return result.exitStatus as Gcertstatus;
  }

  private async runGcert(sshAuthSock: undefined | string) {
    const terminal = vscode.window.createTerminal();
    const waitClose = new Promise<void>(resolve => {
      const subscription = vscode.window.onDidCloseTerminal(closedTerminal => {
        if (closedTerminal === terminal) {
          subscription.dispose();
          resolve();
        }
      });
    });
    terminal.show();

    const command = sshAuthSock ? ['env', `SSH_AUTH_SOCK=${sshAuthSock}`] : [];
    command.push('gcert');
    terminal.sendText('exec ' + escapeArray(command));

    await waitClose;
    if (terminal.exitStatus?.code === 0) {
      void vscode.window.showInformationMessage('gcert succeeded');
      return;
    }
    void vscode.window.showErrorMessage('gcert failed');
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions.splice(0)).dispose();
  }
}
