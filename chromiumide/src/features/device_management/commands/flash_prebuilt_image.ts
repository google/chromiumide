// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as services from '../../../services';
import {Metrics} from '../../metrics/metrics';
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
  chrootService?: services.chromiumos.ChrootService,
  item?: provider.DeviceItem
): Promise<void> {
  if (!chrootService) {
    void showMissingInternalRepoErrorMessage();
    return;
  }

  const source = chrootService.source;

  const hostname = await promptKnownHostnameIfNeeded(
    'Device to Flash',
    item,
    context.deviceRepository
  );
  if (!hostname) {
    return;
  }

  const client = new deviceClient.DeviceClient(
    hostname,
    context.sshIdentity,
    context.output
  );

  const defaultBoard = await retrieveBoardWithProgress(client);

  const board = await vscode.window.showInputBox({
    title: 'Board Name to Flash',
    value: defaultBoard,
  });
  if (!board) {
    return;
  }

  const imageType = await vscode.window.showQuickPick([
    'release',
    'postsubmit',
    'snapshot',
    'cq',
  ]);
  if (!imageType) {
    return;
  }

  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_flash_prebuilt_image',
    description: 'flash prebuilt image',
    image_type: imageType,
  });

  const versions = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Flash Prebuilt Image: Checking available versions',
    },
    async () => {
      return await prebuiltUtil.listPrebuiltVersions(
        board,
        imageType,
        chrootService,
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
    `env BOTO_CONFIG=${source.root}/${BOTO_PATH} cros flash ssh://${hostname} xbuddy://remote/${board}-${imageType}/${version}/test`
  );
  terminal.show();
}

async function showMissingInternalRepoErrorMessage() {
  const openGuide = 'Open guide';
  const openFolder = 'Open folder';

  switch (
    await vscode.window.showErrorMessage(
      'Flashing prebuilt image requires internal chromiumos source code. Please set it up following the official guide, and open a folder in chromiumos repository.',
      openGuide,
      openFolder
    )
  ) {
    case openGuide:
      await vscode.env.openExternal(
        vscode.Uri.parse(
          'https://chromium.googlesource.com/chromiumos/docs/+/HEAD/developer_guide.md#get-the-source-code'
        )
      );
      break;
    case openFolder:
      await vscode.commands.executeCommand('vscode.openFolder');
      break;
  }
}

async function retrieveBoardWithProgress(
  client: deviceClient.DeviceClient
): Promise<string> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: 'Flash Prebuilt Image: Auto-detecting board name',
    },
    async () => {
      const lsbRelease = await client.readLsbRelease();
      return lsbRelease.board;
    }
  );
}
