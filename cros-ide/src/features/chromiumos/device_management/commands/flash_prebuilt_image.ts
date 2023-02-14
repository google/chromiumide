// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as services from '../../../../services';
import {underDevelopment} from '../../../../services/config';
import * as metrics from '../../../metrics/metrics';
import * as deviceClient from '../device_client';
import * as provider from '../device_tree_data_provider';
import * as prebuiltUtil from '../prebuilt_util';
import * as sshUtil from '../ssh_util';
import {
  CnsFileCache,
  getDefaultCacheDir,
} from '../../../../common/cns_file_cache';
import {BuildInfoService} from './../builds/build_info_service';
import {FlashDeviceService} from './../flash/flash_device_service';
import {FlashDevicePanel} from './../flash/flash_device_panel';
import {CommandContext, promptKnownHostnameIfNeeded} from './common';

// Path to the private credentials needed to access prebuilts, relative to
// the CrOS source checkout.
// This path is hard-coded in enter_chroot.sh, but we need it to run
// `cros flash` outside chroot.
const BOTO_PATH =
  'src/private-overlays/chromeos-overlay/googlestorage_account.boto';

export async function flashPrebuiltImage(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService,
  item?: provider.DeviceItem
): Promise<void> {
  metrics.send({
    category: 'interactive',
    group: 'device',
    action: 'flash prebuilt image',
  });

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
    context.output,
    sshUtil.buildMinimalDeviceSshArgs(
      hostname,
      context.extensionContext.extensionUri
    )
  );

  const defaultBoard = await retrieveBoardWithProgress(client);

  if (underDevelopment.deviceManagementFlashV2.get()) {
    // Extract board name before suffix, since current builds data source (live builds) doesn't have
    // the suffixes.
    // TODO(joelbecker): ensure correct handling of board suffixes like '-arc-r'
    const matches = defaultBoard.match(/([^-]+)/gm);
    const baseBoardName = matches ? matches[0] : defaultBoard;

    await flashDeviceV2(context, chrootService, hostname, baseBoardName);
    return;
  }

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
    `env BOTO_CONFIG=${source.root}/${BOTO_PATH} cros flash ssh://${hostname} xbuddy://remote/${board}-release/${version}/test`
  );
  terminal.show();
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
      return lsbRelease.chromeosReleaseBoard;
    }
  );
}

async function flashDeviceV2(
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService,
  hostname: string,
  board: string
) {
  const service = new FlashDeviceService(
    chrootService,
    context.output,
    context.extensionContext
  );
  const buildInfoService = new BuildInfoService(
    new CnsFileCache(
      context.output,
      await getDefaultCacheDir(context.extensionContext)
    )
  );
  new FlashDevicePanel(
    context.extensionContext.extensionUri,
    hostname,
    board,
    service,
    buildInfoService
  );
}
