// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../common/common_util';
import * as shutil from '../../../common/shutil';
import {ReactPanel} from '../../../services/react_panel';
import {Metrics} from '../../metrics/metrics';
import {SshIdentity} from '../ssh_identity';
import * as sshUtil from '../ssh_util';
import {
  parseSyslogLine,
  SyslogViewBackendMessage,
  SyslogViewContext,
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

  /** Flag to avoid running multiple threads loading new syslog entries. */
  private isLoadingNewSyslogEntries = false;
  /** Byte number of the system log entries that are read so far. */
  private localSyslogReadByte = 0;
  /** Line number of the system log entries that are read so far. */
  private localSyslogReadLine = 0;

  constructor(
    private readonly hostname: string,
    private readonly remoteSyslogPath: string,
    extensionUri: vscode.Uri,
    private readonly output: vscode.OutputChannel,
    private readonly sshIdentity: SshIdentity
  ) {
    super(
      'syslog_view',
      extensionUri,
      `${hostname}: ${remoteSyslogPath}`,
      {hostname, remoteSyslogPath},
      {retainContextWhenHidden: true}
    );

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
        this.sshIdentity,
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
        const res = await this.loadNewSyslogEntries();
        if (res instanceof Error) {
          await vscode.window.showErrorMessage(
            `Error from reading new syslog entries: ${res.message}`
          );
        }
      } else if (msg.command === 'copy') {
        Metrics.send({
          category: 'interactive',
          group: 'device',
          name: 'device_management_syslog_viewer_copy',
          description: 'copy in syslog viewer',
        });
        await vscode.env.clipboard.writeText(msg.text);
        void vscode.window.showInformationMessage(
          `Copied to clipboard the system log from ${this.remoteSyslogPath}!`
        );
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
   * Loads the new lines of the syslog, parses them,
   * adds them to `this.syslogEntries`, and passes them to the frontend.
   * Returns (rather than throw) an error from `fs` functions.
   */
  private loadNewSyslogEntries(): Promise<void | Error> {
    return new Promise(resolve => {
      if (this.isLoadingNewSyslogEntries) return;
      // Lock loading of new entries.
      this.isLoadingNewSyslogEntries = true;
      // Remainder from the last read.
      let remainder = '';
      try {
        const stream = fs.createReadStream(this.localSyslogPath, {
          encoding: 'utf-8',
          start: this.localSyslogReadByte,
        });
        stream
          .on('data', (chunk: string) => {
            const lines = (remainder + chunk).split('\n');
            // The last line is the remainder for the next read.
            remainder = lines.pop()!;
            const newEntries = [];
            for (const line of lines) {
              newEntries.push(parseSyslogLine(line, this.localSyslogReadLine));
              this.localSyslogReadLine++;
            }
            // The message is asynchronously posted.
            void this.postMessage({
              command: 'add',
              newEntries,
            });
          })
          .on('close', () => {
            // Set the cursor to the beginning of the next line.
            this.localSyslogReadByte +=
              stream.bytesRead - Buffer.byteLength(remainder, 'utf-8');
            // Unlock loading of new entries.
            this.isLoadingNewSyslogEntries = false;
            resolve();
          })
          .on('error', err => resolve(err));
      } catch (err) {
        if (err instanceof Error) resolve(err);
      }
    });
  }
}
