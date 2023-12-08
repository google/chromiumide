// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as services from '../../../services';
import {Metrics} from '../../metrics/metrics';
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

function matchInputAsImageVersion(
  input: string
): prebuiltUtil.ImageVersion | undefined {
  // Match input string as having a Chrome version if it is a number
  //   1. starting with 2-9 and has at least 2 digits, or
  //   2. starting with 1 and has at least 3 digits, or
  //   3. ending with a hyphen (regardless of its value).
  // In case 3, use the next number ending with . as the ChromeOS version number.
  const versionRegexp = /^R(\d+-|[2-9]\d+|1\d\d+)(?:(\d+)\.)?/;
  const m = versionRegexp.exec(input);
  if (!m) return undefined;
  return {
    chromeMilestone: Number(
      // Remove trailing hyphen, if any.
      m[1].endsWith('-') ? m[1].slice(0, m[1].length - 1) : m[1]
    ),
    chromeOsMajor: m[2] ? Number(m[2]) : undefined,
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
 * Contains only the Chrome milestone in a full ChromeOS version.
 * This is an intermediate pick item for users to narrow down the full version they want and speed
 * up fetching available images on gs.
 */
class ChromeMilestoneItem extends SimplePickItem {
  constructor(readonly milestone: number) {
    super(`R${milestone}-`);
  }
}

/*
 * A full ChromeOS version. This would be the final image choice passed to the cros flash command.
 */
class ChromeOsVersionItem extends SimplePickItem {
  constructor(readonly fullVersion: string) {
    super(fullVersion);
  }
}

/*
 * Return full path of remote image to flash with, or undefined if user exits prematurely.
 */
async function showImageVersionInputBoxWithDynamicSuggestions(
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

  const chromeMilestonesItems: (ChromeMilestoneItem | SimplePickItem)[] = (
    await prebuiltUtil.getChromeMilestones()
  ).map((milestone: number) => new ChromeMilestoneItem(milestone));
  chromeMilestonesItems.unshift(
    new SimplePickItem(
      'Chrome Milestones (CrOS image version filter)',
      vscode.QuickPickItemKind.Separator
    )
  );

  const task: Promise<string | undefined> = new Promise(resolve => {
    const fetchedVersionPatterns: string[] = [];
    let fetchedVersionItems: (ChromeOsVersionItem | SimplePickItem)[] = [];

    // Keep input box opened when lost focus since it is typical for user to change to another
    // window to search for or copy version string they want.
    // Disable sorting so that items (versions) are displayed in the original order, where images
    // are listed from most recent to least.
    Object.assign(picker, {
      ignoreFocusOut: true,
      sortByLabel: false,
      ...options,
    });

    // First show only Chrome milestones (e.g. 'R121-', 'R120-', ...).
    picker.items = chromeMilestonesItems;

    subscriptions.push(
      picker.onDidChangeValue(async () => {
        // picker.value could be either a manual input from user or selected from the list of Chrome
        // milestones.
        const newInputImage = matchInputAsImageVersion(picker.value);

        // If the input is not valid (at least containing a proper Chrome milestone), reset items to
        // the list of milestones.
        if (!newInputImage) {
          picker.items = chromeMilestonesItems;
          return;
        }

        // No need to refetch versions if the current input has been queried already, return early
        // after resetting items as the list of all fetched version items (to be filtered by
        // vscode.QuickPick API).
        const pattern = `R${newInputImage.chromeMilestone}-${
          newInputImage.chromeOsMajor ?? '*'
        }.*`;
        if (fetchedVersionPatterns.includes(pattern)) {
          picker.items = fetchedVersionItems;
          return;
        }

        fetchedVersionPatterns.push(pattern);

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
          ...new Set(
            fetchedVersionItems.map(item => item.label).concat(versions)
          ),
        ];
        fetchedVersionItems = versions.map(
          label => new ChromeOsVersionItem(label)
        );
        fetchedVersionItems.unshift(
          new SimplePickItem(
            'Full CrOS image versions available for flashing device',
            vscode.QuickPickItemKind.Separator
          )
        );
        picker.items = fetchedVersionItems;
      }),
      picker.onDidAccept(() => {
        const selectedItem = picker.activeItems[0];
        if (selectedItem instanceof ChromeMilestoneItem) {
          // User selected a Chrome milestone, empty the list and set it as value on input box.
          // It would trigger onDidChangeValue(), and be parsed to list all prebuilt versions with
          // this milestone.
          picker.value = selectedItem.label;
          picker.items = [];
        } else {
          // User selected a full ChromeOS image version listed on gs.
          const version = selectedItem.label;
          resolve(`xbuddy://remote/${board}-${imageType}/${version}/test`);
        }
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

  const attributes = await context.deviceClient.getDeviceAttributes(hostname);
  const defaultBoard =
    attributes instanceof Error ? undefined : attributes.board;
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
            title: `Image version: available images in gs://chromeos-image-archive/${board}-${imageType}/`,
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
