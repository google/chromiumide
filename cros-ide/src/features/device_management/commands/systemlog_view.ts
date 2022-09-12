// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as metrics from '../../metrics/metrics';
import * as provider from '../device_tree_data_provider';
import * as sshUtil from '../ssh_util';
import * as shutil from '../../../common/shutil';
import * as commonUtil from '../../../common/common_util';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';
import {escapeForHtmlAttribute, replaceAll} from './../html_util';

export async function openSystemLogViewer(
  context: CommandContext,
  item?: provider.DeviceItem
): Promise<void> {
  metrics.send({
    category: 'interactive',
    group: 'device',
    action: 'open system log viewer',
  });

  const hostname = await promptKnownHostnameIfNeeded(
    'Open System Log Viewer',
    item,
    context.deviceRepository
  );
  if (!hostname) {
    return;
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), '/'));
  const textFile = 'syslog.txt';

  const createSyslogCommand =
    shutil.escapeArray(
      sshUtil.buildSshCommand(hostname, context.extensionContext.extensionUri)
    ) +
    ' cat /var/log/messages > ' +
    tempDir +
    '/' +
    textFile;

  // TODO: Avoid going through sh.
  const result = await commonUtil.exec('sh', ['-c', createSyslogCommand], {
    logger: context.output,
  });
  if (result instanceof Error) {
    void vscode.window.showErrorMessage('Failed to get syslog: ${result}');
    await fs.promises.rmdir(tempDir, {recursive: true});
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'systemLog',
    `System Log: ${hostname}`,
    vscode.ViewColumn.One,
    {
      localResourceRoots: [
        vscode.Uri.file(tempDir),
        vscode.Uri.file(context.extensionContext.extensionPath),
      ],
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  await startWebview(panel, tempDir, context, textFile);

  panel.onDidDispose(async () => {
    await fs.promises.rmdir(tempDir, {recursive: true});
  });
}

function getWebviewContent(
  webview: vscode.Webview,
  syslogUrl: vscode.Uri,
  context: vscode.ExtensionContext
): string {
  const filePath = path.join(context.extensionPath, 'dist/views/syslog.html');
  const html = fs.readFileSync(filePath, {encoding: 'utf-8'});
  return replaceAll(html, [
    {
      from: /%EXTENSION_ROOT_URL_ESCAPED_FOR_ATTR%/g,
      to: escapeForHtmlAttribute(
        webview.asWebviewUri(context.extensionUri).toString()
      ),
    },
    {
      from: /%SYSLOG_URL_ESCAPED_FOR_ATTR%/g,
      to: escapeForHtmlAttribute(webview.asWebviewUri(syslogUrl).toString()),
    },
  ]);
}

async function startWebview(
  panel: vscode.WebviewPanel,
  tempDir: string,
  context: CommandContext,
  textFile: string
): Promise<void> {
  const pathToFile = vscode.Uri.file(path.join(tempDir, textFile));
  const syslogUrl = panel.webview.asWebviewUri(pathToFile);
  panel.webview.html = getWebviewContent(
    panel.webview,
    syslogUrl,
    context.extensionContext
  );
}
