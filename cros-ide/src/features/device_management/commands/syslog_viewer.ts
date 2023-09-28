// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Metrics} from '../../metrics/metrics';
import * as provider from '../device_tree_data_provider';
import {SyslogPanel} from '../syslog/panel';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

/** Ask the remote system log to open. */
async function askRemoteSyslogPath(): Promise<string | undefined> {
  // Based on https://chromium.googlesource.com/chromiumos/docs/+/HEAD/logging.md#locations.
  type RemoteSyslogPickItem = vscode.QuickPickItem & {path?: string};
  const remoteSyslogPickItems: RemoteSyslogPickItem[] = [
    {
      label: '$(file) /var/log/messages',
      description: 'General system logs.',
      path: '/var/log/messages',
    },
    {
      label: '$(file) /var/log/net.log',
      description: 'Network-related logs.',
      path: '/var/log/net.log',
    },
    {
      label: '$(file) /var/log/boot.log',
      description: 'Boot messages.',
      path: '/var/log/boot.log',
    },
    {
      label: '$(file) /var/log/secure.log',
      description: 'Logs with authpriv facility.',
      path: '/var/log/secure.log',
    },
    {
      label: '$(file) /var/log/upstart.log',
      description: 'Upstart logs.',
      path: '/var/log/upstart.log',
    },
    {
      label: '$(file) /var/log/chrome/chrome',
      description: 'Chrome UI logs.',
      path: '/var/log/chrome/chrome',
    },
    {
      label: '$(file) /var/log/lacros/lacros.log',
      description: 'Lacros logs.',
      path: '/var/log/lacros/lacros.log',
    },
    {
      label: 'Enter a custom file path...',
    },
  ];
  const remoteSyslogPicked = await vscode.window.showQuickPick(
    remoteSyslogPickItems,
    {
      title: 'System Log Select',
      placeHolder: "Select the remote device's system log to open.",
    }
  );
  if (!remoteSyslogPicked) return;
  let remoteSyslogPath = remoteSyslogPicked.path;
  if (!remoteSyslogPath) {
    remoteSyslogPath = await vscode.window.showInputBox({
      title: 'System Log Select: Custom',
      prompt:
        "Enter the file path of the remote device's system log to open. " +
        "The log should be in CrOS's standard log format.",
      value: '/var/log/messages',
    });
    if (!remoteSyslogPath) return;
  }
  return remoteSyslogPath;
}

export async function openSystemLogViewer(
  context: CommandContext,
  item?: provider.DeviceItem
): Promise<void> {
  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_syslog_viewer_open',
    description: 'open system log viewer',
  });

  const hostname = await promptKnownHostnameIfNeeded(
    'Open System Log Viewer',
    item,
    context.deviceRepository
  );
  if (!hostname) {
    return;
  }

  const remoteSyslogPath = await askRemoteSyslogPath();
  if (!remoteSyslogPath) return;

  new SyslogPanel(
    hostname,
    remoteSyslogPath,
    context.extensionContext.extensionUri,
    context.output,
    context.sshIdentity
  );
}
