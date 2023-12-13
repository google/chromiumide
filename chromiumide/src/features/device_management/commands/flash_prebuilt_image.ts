// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as services from '../../../services';
import {Metrics} from '../../metrics/metrics';
import * as deviceClient from '../device_client';
import * as provider from '../device_tree_data_provider';
import * as prebuiltUtil from '../prebuilt_util';
import {
  SimplePickItem,
  CommandContext,
  promptKnownHostnameIfNeeded,
  showMissingInternalRepoErrorMessage,
} from './common';

// Path to the private credentials needed to access prebuilts, relative to
// the CrOS source checkout.
// This path is hard-coded in enter_chroot.sh, but we need it to run
// `cros flash` outside chroot.
const BOTO_PATH =
  'src/private-overlays/chromeos-overlay/googlestorage_account.boto';

type ParsedImageVersion = {
  chromeVer: string;
  chromeOsVer?: string;
};

function matchInputAsImageVersion(
  input: string
): ParsedImageVersion | undefined {
  // Match input string as having a Chrome version if it is a number
  //   1. starting with 2-9 and has at least 2 digits, or
  //   2. starting with 1 and has at least 3 digits, or
  //   3. ending with a hyphen (regardless of its value).
  // In case 3, use the next number ending with . as the ChromeOS version number.
  const versionRegexp = /^R(\d+-|[2-9]\d+|1\d\d+)(?:(\d+)\.)?/;
  const m = versionRegexp.exec(input);
  if (!m) return undefined;
  return {
    // Remove trailing hyphen, if any.
    chromeVer: m[1].endsWith('-') ? m[1].slice(0, m[1].length - 1) : m[1],
    chromeOsVer: m[2],
  };
}

/*
 * Return full path of local image to flash with, or undefined if user exits prematurely.
 */
async function showAllLocalImagesInputBox(
  board: string,
  chrootService: services.chromiumos.ChrootService,
  options?: {
    title?: string;
  }
): Promise<string | undefined> {
  const imagesDir = path.join(
    chrootService.chromiumosRoot,
    '/src/build/images/',
    board
  );
  let images = await fs
    .readdirSync(imagesDir)
    .filter(image =>
      fs.existsSync(path.join(imagesDir, image, 'chromiumos_test_image.bin'))
    );
  if (images.length === 0) {
    throw new Error(`No image available at ${imagesDir}.`);
  }

  // Move 'latest' (symlink to the most recent image) to beginning of array since it is the most
  // popular workflow and should be the most accessible.
  if (images.includes('latest')) {
    images = images.filter(image => image !== 'latest');
    images.unshift('latest');
  }

  const image = await vscode.window.showQuickPick(images, {
    ignoreFocusOut: true,
    ...options,
  });
  if (!image) return undefined;
  return path.join(imagesDir, image, 'chromiumos_test_image.bin');
}

/*
 * Return full path of remote image to flash with, or undefined if user exits prematurely.
 */
function showImageVersionInputBoxWithDynamicSuggestions(
  board: string,
  imageType: string,
  chrootService: services.chromiumos.ChrootService,
  logger: vscode.OutputChannel,
  options?: {
    title?: string;
    placeholder?: string;
  }
): Promise<string | undefined> {
  const picker = vscode.window.createQuickPick();
  const subscriptions: vscode.Disposable[] = [];
  let queries_count = 0;

  const task: Promise<string | undefined> = new Promise(resolve => {
    // Each Chrome version is key to an array of ChromeOS versions fetched, including '*' for
    // arbitrary ChromeOS versions.
    const fetchedVersions: string[] = [];

    // Keep input box opened when lost focus since it is typical for user to change to another
    // window to search for or copy version string they want.
    // Disable sorting so that items (versions) are displayed in the original order, where images
    // are listed from most recent to least.
    Object.assign(picker, {
      ignoreFocusOut: true,
      sortByLabel: false,
      ...options,
    });
    picker.items = [];

    subscriptions.push(
      picker.onDidChangeValue(async () => {
        const newInputImage = matchInputAsImageVersion(picker.value);

        // Return early if the input is not valid for fetching images, or has been queried already.
        if (!newInputImage) return;
        const pattern = `R${newInputImage.chromeVer}-${
          newInputImage.chromeOsVer ?? '*'
        }.*`;
        if (fetchedVersions.includes(pattern)) return;

        fetchedVersions.push(pattern);

        queries_count += 1;
        picker.busy = true;
        let versions;
        try {
          versions = await prebuiltUtil.listPrebuiltVersions(
            board,
            imageType,
            chrootService,
            logger,
            pattern
          );
        } finally {
          queries_count -= 1;
          if (queries_count === 0) picker.busy = false;
        }

        // Concatenate new version candidates to the list of items, instead of resetting, and let vscode quickpick handle showing subset matching with real current input.
        // This is to avoid overwriting picker.items with results from an obsolete prebuiltUtil.listPrebuiltVersions request that finishes later (for example if the pattern has a lot more matches on gsutil list).
        // Remove duplicates by casting to and back from a set.
        versions = [
          ...new Set(picker.items.map(item => item.label).concat(versions)),
        ];
        picker.items = versions.map(label => new SimplePickItem(label));
      }),
      picker.onDidAccept(() => {
        const version = picker.activeItems[0].label;
        resolve(`xbuddy://remote/${board}-${imageType}/${version}/test`);
      }),
      picker.onDidHide(() => {
        resolve(undefined);
      })
    );

    picker.show();
  });

  return task.finally(() => {
    picker.hide();
    picker.dispose();
    vscode.Disposable.from(...subscriptions).dispose();
  });
}

export async function flashPrebuiltImage(
  context: CommandContext,
  chrootService?: services.chromiumos.ChrootService,
  item?: provider.DeviceItem
): Promise<void> {
  if (!chrootService) {
    void showMissingInternalRepoErrorMessage('Flashing prebuilt image');
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
    context.sshIdentity,
    context.output
  );

  const defaultBoard = await retrieveBoardWithProgress(client, hostname);

  const board = await vscode.window.showInputBox({
    title: 'Board Name to Flash',
    value: defaultBoard,
    prompt: !defaultBoard
      ? 'Failed to get board from device, please input board name'
      : undefined,
    ignoreFocusOut: true,
  });
  if (!board) {
    return;
  }

  const imageType = await vscode.window.showQuickPick(
    ['release', 'postsubmit', 'snapshot', 'cq', 'local'],
    {ignoreFocusOut: true}
  );
  if (!imageType) {
    return;
  }

  const imagePath =
    imageType === 'local'
      ? await showAllLocalImagesInputBox(board, chrootService, {
          title: `Image version: available images in src/build/images/${board}/`,
        })
      : await showImageVersionInputBoxWithDynamicSuggestions(
          board,
          imageType,
          chrootService,
          context.output,
          {
            title: `Image version: available images on gs://chromeos-image-archive/${board}-${imageType}/ will be listed given sufficient version number for matching, e.g. 'R99', 'R102', 'R12-', and optionally ChromeOS version number, e.g. 'R119-15608.'; remaining of the version string is optional.`,
            placeholder:
              imageType === 'release'
                ? 'Rxxx-yyyyy.0.0'
                : 'Rxxx-yyyyy.0.0-zzzzz-wwwwwwwwwwwwwwwwwww',
          }
        );

  // Version is undefined because user hide the picker (by pressing esc).
  if (!imagePath) return;

  Metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_flash_prebuilt_image',
    description: 'flash prebuilt image',
    image_type: imageType,
  });

  const terminal = vscode.window.createTerminal({
    name: `cros flash: ${hostname}`,
    iconPath: new vscode.ThemeIcon('cloud-download'),
    cwd: source.root,
  });
  terminal.sendText(
    `env BOTO_CONFIG=${source.root}/${BOTO_PATH} cros flash ssh://${hostname} ${imagePath}`
  );
  terminal.show();
}

async function retrieveBoardWithProgress(
  client: deviceClient.DeviceClient,
  hostname: string
): Promise<string | undefined> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: 'Flash Prebuilt Image: Auto-detecting board name',
    },
    async () => {
      const result = await client.readLsbRelease(hostname);
      return result instanceof Error ? undefined : result.board;
    }
  );
}
