// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as shutil from '../../../../common/shutil';
import * as commonUtil from '../../../../common/common_util';
import * as sshUtil from '../ssh_util';
import {ReactPanel} from '../../../../services/react_panel';
import {
  SyslogViewBackendMessage,
  SyslogEntry,
  SyslogViewContext,
  SyslogSeverity,
  SyslogViewFrontendMessage,
} from './model';

const SYSLOG_FILE = 'syslog.txt';

/**
 * Webview panel for the system log viewer.
 *
 * It manages an external process to stream the remote system log to a local file.
 */
export class SyslogPanel extends ReactPanel<SyslogViewContext> {
  /**
   * Canceller, triggered on disposal of this panel.
   *
   * TODO(ymat): Add this to `ReactPanel`?
   */
  private readonly canceller = new vscode.CancellationTokenSource();

  /** Path of the local temporary directory. */
  private readonly localTempDir: string;
  /** Path to the local system log file. */
  private readonly localSyslogPath: string;

  constructor(
    private readonly hostname: string,
    private readonly remoteSyslogPath: string,
    extensionUri: vscode.Uri,
    private readonly output: vscode.OutputChannel
  ) {
    super('syslog_view', extensionUri, `${hostname}: ${remoteSyslogPath}`, {
      hostname,
      remoteSyslogPath,
    });

    // Clean up the canceller on disposal.
    this.disposables.push(this.canceller);

    // Create a temporary directory.
    this.localTempDir = fs.mkdtempSync(path.join(os.tmpdir(), '/'));
    // Remove the temporary directory on disposal.
    this.disposables.push(
      new vscode.Disposable(() => {
        void fs.promises.rm(this.localTempDir, {recursive: true, force: true});
      })
    );

    // Set the local system log path.
    this.localSyslogPath = path.join(this.localTempDir, SYSLOG_FILE);

    // Execute the tail process in the background.
    void this.execSyslogTail().then(result => {
      if (this.canceller.token.isCancellationRequested) {
        // The execution was already canceled, do not show pop-ups.
        return;
      }
      if (result instanceof Error) {
        void vscode.window.showErrorMessage(
          `System log viewer: SSH connection aborted: ${result}`
        );
      }
    });
  }

  /**
   * Runs an external process to stream the remote system log to the local file.
   */
  private execSyslogTail(): Promise<commonUtil.ExecResult | Error> {
    // `tail -F` command keeps listening even if the file `remoteSyslogPath`
    // doesn't exist, waiting for the file to appear.
    const tailCommand = `${shutil.escapeArray(
      sshUtil.buildSshCommand(
        this.hostname,
        this.extensionUri,
        undefined,
        `tail -F -n +1 ${this.remoteSyslogPath}`
      )
    )} > ${shutil.escape(this.localSyslogPath)}`;

    return commonUtil.exec('sh', ['-c', tailCommand], {
      logger: this.output,
      cancellationToken: this.canceller.token,
    });
  }

  protected handleWebviewMessage(msg: SyslogViewFrontendMessage): void {
    void (async () => {
      if (msg.command === 'reload') {
        const entries = await this.loadSyslogOrThrow();
        await this.postMessage({command: 'reset', entries: entries});
      }
    })();
  }

  /**
   * Posts a message to the frontend.
   * Type-safe wrapper of `this.panel.webview.postMessage`.
   *
   * TODO(ymat): Add a util method like this to `ReactPanel` .
   */
  private async postMessage(msg: SyslogViewBackendMessage): Promise<void> {
    await this.panel.webview.postMessage(msg);
  }

  /**
   * Loads the whole content of the syslog and parses it.
   * Throws the error from `fs.promises.readFile`.
   *
   * TODO(ymat): Use ReadStream to load only the new entries.
   */
  private async loadSyslogOrThrow(): Promise<SyslogEntry[]> {
    // TODO: Read only the added lines of the file.
    const contents = await fs.promises.readFile(this.localSyslogPath!, 'utf-8');
    const lines = contents.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines.map((text, lineNum) => {
      const [timestamp, severity, process, ...messages] = text.split(' ');
      const message = messages.join(' ');
      return {
        lineNum,
        timestamp,
        severity: severity as SyslogSeverity,
        process,
        message,
      };
    });
  }
}
