// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {SimplePickItem} from '../../../../../shared/app/ui/input_box';
import {ChrootService} from '../../../../services/chromiumos';
import {PrebuiltImageType, listPrebuiltVersions} from '../../prebuilt_util';
import {
  ChromeOsVersionItem,
  showAllLocalImagesInputBox,
} from '../flash_prebuilt_image';
import {CheckerConfig, CheckerInput} from './types';

const LOAD_ALL_VERSIONS_PICK_ITEM = new SimplePickItem(
  'All versions within allowed range',
  undefined,
  'select to load...'
);

const RETURN_TO_IMAGE_TYPE_SELECTION = 'Return to select image type.';

/*
 * Shows input box for an interactive image selection process similar to that for the flashing image
 * command, but limited only to images compatible with local environment based on result of the
 * check image command.
 *
 * Returns a valid image parameter to `cros flash`, either a local or gs prebuilt image path;
 * or undefined if user cancels.
 */
export async function showSuggestedImagesInputBox(
  hostname: string,
  config: CheckerConfig,
  input: CheckerInput,
  chrootService: ChrootService,
  logger: vscode.OutputChannel
): Promise<string | undefined> {
  if (
    input.device instanceof Error ||
    input.local.debugFlag instanceof Error ||
    input.local.chromeosMajorVersion instanceof Error
  ) {
    return undefined;
  }
  const board = input.device.board;
  const validPrebuiltImageTypes: PrebuiltImageType[] =
    input.local.debugFlag === undefined
      ? ['postsubmit', 'snapshot', 'release'] // Any prebuilt images if cros-debug flag not exist.
      : input.local.debugFlag
      ? ['postsubmit', 'snapshot'] // cros-debug flag is set.
      : ['release']; // cros-debug flag is unset.
  const chromeosMajorVersion = input.local.chromeosMajorVersion;

  let option: string | undefined = RETURN_TO_IMAGE_TYPE_SELECTION;
  while (option === RETURN_TO_IMAGE_TYPE_SELECTION) {
    const imageType = await vscode.window.showQuickPick(
      [...validPrebuiltImageTypes, 'local'],
      {title: 'Select image type', ignoreFocusOut: true}
    );
    if (!imageType) {
      return;
    }

    // Do not care about version if image is built locally, assume compatible.
    if (imageType === 'local') {
      return await showAllLocalImagesInputBox(board, chrootService);
    }

    option = await showAllMatchingImagesQuickPick(
      imageType as PrebuiltImageType,
      board,
      chromeosMajorVersion,
      config.versionMaxSkew,
      hostname,
      chrootService,
      logger
    );
  }
  return option;
}

/*
 * Shows a quick pick that would prompt user to select an image of the specified type within th
 * range +/- max skew (from config) from current repo prebuilt version and returns the selection.
 *
 * It is possible that there are no matching images within the searched range if the user's
 * repository is older (especially for postsubmit which are kept for 5 days only, see
 * go/image-sync-playbook#overview-2).
 * Provide also the choice to choose another image type in that case.
 */
async function showAllMatchingImagesQuickPick(
  imageType: PrebuiltImageType,
  board: string,
  chromeosMajorVersion: number,
  maxSkew: number,
  hostname: string,
  chrootService: ChrootService,
  logger: vscode.OutputChannel,
  onDidChangePickerItemsForTesting?: vscode.EventEmitter<
    readonly vscode.QuickPickItem[]
  >
): Promise<string | undefined> {
  const picker = vscode.window.createQuickPick();
  // Keep input box opened when lost focus since it is typical for user to change to another
  // window to search for or copy version string they want.
  // Disable sorting so that items (versions) are displayed in the original order, where images
  // are listed from most recent to least.
  Object.assign(picker, {
    ignoreFocusOut: true,
    sortByLabel: false,
    title: `Image version: ${imageType} images compatible with ${hostname}`,
  });
  picker.show();

  // First show only images from current version, with additional option to show the other ones
  // also within the threshold.
  // This is because most users probably want the one closest to their local repository, and
  // fetching all eligible versions (current + default 7 * 2 before and after) will take too long.
  picker.busy = true; // Set status to busy until version items are fetched.
  const versions = await listPrebuiltVersions(
    board,
    imageType,
    chrootService,
    logger,
    `*-${chromeosMajorVersion}.*`
  );

  let versionItems: ChromeOsVersionItem[] = [];
  if (versions instanceof Error) {
    void vscode.window.showWarningMessage(
      `Suggest image: failed to fetch paths matching gs://chromeos-image-archive/${board}-${imageType}/${`*-${chromeosMajorVersion}.*`}/image.zip: ${
        versions.message
      }`
    );
  } else {
    versionItems = versions.map(
      label =>
        new ChromeOsVersionItem(label, 'Local repo ChromeOS major version')
    );
    picker.items = versionItems;
  }
  picker.items = picker.items.concat(LOAD_ALL_VERSIONS_PICK_ITEM);
  onDidChangePickerItemsForTesting?.fire(picker.items);
  picker.busy = false;

  const tokenSource = new vscode.CancellationTokenSource();
  const subscriptions: vscode.Disposable[] = [];
  const task: Promise<string | undefined> = new Promise(resolve => {
    subscriptions.push(
      picker.onDidAccept(async () => {
        const selectedItem = picker.activeItems[0];
        // User selected an image version listed on gs, return the gs path usable for flashing.
        if (selectedItem instanceof ChromeOsVersionItem) {
          const version = selectedItem.label;
          resolve(`xbuddy://remote/${board}-${imageType}/${version}/test`);
          return;
        }
        // No matching images of this type within threshold and user chose to search for one of a
        // different type.
        if (selectedItem.label.endsWith(RETURN_TO_IMAGE_TYPE_SELECTION)) {
          resolve(RETURN_TO_IMAGE_TYPE_SELECTION);
          return;
        }
        // User selected "Show all versions within allowed range".
        // Drop the selected option and keep only the image version items.
        picker.items = versionItems;
        // Set picker as busy until all versions are shown. The option is only available once so
        // there will be no race condition on (un)setting the busy status.
        picker.busy = true;
        // All CrOS major versions within [current - threshold, current + threshold] except current
        // (already fetched).
        const versions = Array.from(
          {length: maxSkew},
          (_, k) => chromeosMajorVersion + maxSkew - k
        ).concat(
          Array.from({length: maxSkew}, (_, k) => chromeosMajorVersion - k - 1)
        );
        let finishedCount = 0;
        // Since `listPrebuiltVersions` has to be called separately for each version (`gsutil ls`
        // does not take regex for pattern matching, only wildcard), update the list using event
        // emitter instead of waiting for all calls to finish.
        const onFetchedImageVersionsEmitter = new vscode.EventEmitter<
          string[] | Error
        >();
        // If multiple calls to list gs image are failing, they are likely to have the same root
        // cause, show error to user only once to avoid spamming.
        let haveShownError = false;
        const onFetchedImageVersions = onFetchedImageVersionsEmitter.event;
        subscriptions.push(
          onFetchedImageVersionsEmitter,
          onFetchedImageVersions(imageVersions => {
            finishedCount += 1;

            if (imageVersions instanceof Error) {
              if (!haveShownError) {
                void vscode.window.showWarningMessage(
                  `Suggest image: failed to fetch image on gs://chromeos-image-archive: ${imageVersions.message}`
                );
                haveShownError = true;
              }
            } else {
              versionItems = versionItems
                // Add newly returned version strings to list, each call has a different CrOS major
                // version so the sets are all distinct and no need to remove duplicates.
                .concat(
                  imageVersions.map(label => new ChromeOsVersionItem(label))
                )
                // Sort in reverse order so that the more recent version comes first.
                .sort((a, b) => b.label.localeCompare(a.label));
              picker.items = versionItems;
            }

            // Completed fetching available image paths for each queried CrOS major version.
            if (finishedCount === versions.length) {
              picker.busy = false;
              if (picker.items.length === 0) {
                picker.items = [
                  new SimplePickItem(
                    `Oops, no ${imageType} image within ${chromeosMajorVersion}±${maxSkew}. ${RETURN_TO_IMAGE_TYPE_SELECTION}`
                  ),
                ];
              }
              onDidChangePickerItemsForTesting?.fire(picker.items);
            }
          })
        );
        for (const version of versions) {
          void fetchAllPrebuiltVersionsInParallel(
            board,
            imageType,
            chrootService,
            logger,
            version,
            onFetchedImageVersionsEmitter,
            tokenSource.token
          );
        }
      }),
      picker.onDidHide(() => {
        resolve(undefined);
      })
    );
  });
  return task.finally(() => {
    picker.hide();
    tokenSource.cancel();
    vscode.Disposable.from(...subscriptions, picker, tokenSource).dispose();
  });
}

async function fetchAllPrebuiltVersionsInParallel(
  board: string,
  imageType: PrebuiltImageType,
  chrootService: ChrootService,
  logger: vscode.OutputChannel,
  chromeosMajorVersion: number,
  onFetchedImageVersionsEmitter: vscode.EventEmitter<Error | string[]>,
  token: vscode.CancellationToken
): Promise<void> {
  const versions = await listPrebuiltVersions(
    board,
    imageType,
    chrootService,
    logger,
    `*-${chromeosMajorVersion}.*`,
    token
  );
  onFetchedImageVersionsEmitter.fire(versions);
}

export const TEST_ONLY = {
  showAllMatchingImagesQuickPick,
  LOAD_ALL_VERSIONS_PICK_ITEM,
  RETURN_TO_IMAGE_TYPE_SELECTION,
};
