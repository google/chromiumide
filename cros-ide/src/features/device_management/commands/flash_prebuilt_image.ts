// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as metrics from '../../metrics/metrics';
import * as deviceClient from '../device_client';
import * as provider from '../device_tree_data_provider';
import * as prebuiltUtil from '../prebuilt_util';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

// Path to the private credentials needed to access prebuilts, relative to
// the CrOS source checkout.
// This path is hard-coded in enter_chroot.sh, but we need it to run
// `cros flash` outside chroot.
const BOTO_PATH =
  'src/private-overlays/chromeos-overlay/googlestorage_account.boto';

export async function flashPrebuiltImage(
  context: CommandContext,
  item?: provider.DeviceItem
): Promise<void> {
  metrics.send({
    category: 'interactive',
    group: 'device',
    action: 'flash prebuilt image',
  });

  const source = context.chrootService.source();
  if (source === undefined) {
    void vscode.window.showErrorMessage(
      'Workspace does not contain CrOS source checkout.'
    );
    return;
  }

  const hostname = await promptKnownHostnameIfNeeded(
    'Device to Flash',
    item,
    context.ownedDeviceRepository
  );
  if (!hostname) {
    return;
  }

  const client = new deviceClient.DeviceClient(
    hostname,
    context.extensionContext.extensionUri,
    context.output
  );

  const defaultBoard = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Flash Prebuilt Image: Auto-detecting board name',
    },
    async () => {
      const lsbRelease = await client.readLsbRelease();
      return lsbRelease.board;
    }
  );

  const board = await vscode.window.showInputBox({
    title: 'Board Name to Flash',
    value: defaultBoard,
  });
  if (!board) {
    return;
  }

  const versions = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Flash Prebuilt Image: Checking available versions',
    },
    async () => {
      return await prebuiltUtil.listPrebuiltVersions(
        board,
        context.chrootService,
        context.output
      );
    }
  );

  const version = await vscode.window.showQuickPick(versions, {
    title: 'Version',
  });
  if (!version) {
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: `cros flash: ${hostname}`,
    iconPath: new vscode.ThemeIcon('cloud-download'),
    cwd: source.root,
  });
  terminal.sendText(
    `env BOTO_CONFIG=${source}/${BOTO_PATH} cros flash ssh://${hostname} xbuddy://remote/${board}-release/${version}/test`
  );
  terminal.show();
}
