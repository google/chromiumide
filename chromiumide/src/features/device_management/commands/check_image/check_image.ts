// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Board} from '../../../../common/chromiumos/board_or_host';
import {
  getQualifiedPackageName,
  ParsedPackageName,
} from '../../../../common/chromiumos/portage/ebuild';
import {getUseFlagsInstalled} from '../../../../common/chromiumos/portage/equery';
import {getCrosPrebuiltVersionsFromBinHost} from '../../../../common/chromiumos/repo_status';
import {chromiumos} from '../../../../services';
import {deviceManagement} from '../../../../services/config';
import {CommandContext, promptKnownHostnameIfNeeded} from '../common';
import {flashImageToDevice, flashPrebuiltImage} from '../flash_prebuilt_image';
import {CompatibilityChecker} from './compatibility';
import {showSuggestedImagesInputBox} from './suggest_image';
import {CheckerInput, CheckerConfig, CheckerOutput} from './types';

enum PostFailedImageCheckOptions {
  FLASH_SUGGESTED_IMAGE_OPTION = 'Yes, show list of suggested images.',
  FLASH_ANY_IMAGE_OPTION = 'Yes, show flash image menu.',
  OPEN_VERSION_THRESHOLD_OPTION = 'No, open extension config to change version skew threshold.',
  DEFAULT_IGNORE_WARNING_OPTION = 'No, ignore warning.',
}

export enum CheckOutcome {
  CANCELLED = 'cancelled',
  PASSED = 'passed',
  FLASHED_FROM_SUGGESTION = 'flashed from suggested images',
  FLASHED_FROM_MENU = 'flashed arbitrary image from menu',
  SKIPPED_FLASH = 'skipped flash new image suggestion',
  OPEN_VERSION_MAX_SKEW_CONFIG = 'open settings for version max skew',
}

/*
 * Runs cros-debug flag and CrOS image version check on device image.
 * User may choose to flash device from list of suggested image or manually select one via the usual
 * flash image steps.
 */
export async function checkDeviceImageCompatibilityOrSuggest(
  context: CommandContext,
  chrootService: chromiumos.ChrootService,
  deviceHostname?: string
): Promise<CheckOutcome | Error> {
  const hostname = await promptKnownHostnameIfNeeded(
    'Target Device',
    deviceHostname,
    context.deviceRepository
  );
  if (!hostname) {
    return CheckOutcome.CANCELLED;
  }
  const {config, input, output} = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Checking ${hostname} compatibility with local environment...`,
    },
    async _progress => {
      return await checkDeviceImageCompatibility(
        context,
        chrootService,
        hostname
      );
    }
  );

  const option = await reportResultAndPromptActionOnFailedCheck(input, output);

  // No follow-up action required if check passed.
  if (output.passed) return CheckOutcome.PASSED;

  if (option === PostFailedImageCheckOptions.FLASH_SUGGESTED_IMAGE_OPTION) {
    const imagePath = await showSuggestedImagesInputBox(
      hostname,
      config,
      input,
      chrootService,
      context.output
    );
    if (imagePath !== undefined) {
      const flashImageStatus = await flashImageToDevice(
        hostname,
        imagePath,
        context.deviceClient,
        chrootService.source.root,
        context.output
      );
      if (flashImageStatus instanceof Error) return flashImageStatus;
      if (flashImageStatus) return CheckOutcome.FLASHED_FROM_MENU;
    }
  } else if (option === PostFailedImageCheckOptions.FLASH_ANY_IMAGE_OPTION) {
    const flashImageStatus = await flashPrebuiltImage(
      context,
      chrootService,
      hostname
    );
    if (flashImageStatus instanceof Error) return flashImageStatus;
    if (flashImageStatus) return CheckOutcome.FLASHED_FROM_MENU;
  } else if (
    option === PostFailedImageCheckOptions.OPEN_VERSION_THRESHOLD_OPTION
  ) {
    void deviceManagement.imageVersionMaxSkew.openSettings();
    return CheckOutcome.OPEN_VERSION_MAX_SKEW_CONFIG;
  }
  // User chose 'cancel' or not to do anything.
  return CheckOutcome.SKIPPED_FLASH;
}

/*
 * Runs cros-debug flag and CrOS image version check on device image and returns result of analysis.
 * The result could be converted into human readable message using checkImageResultToString().
 */
async function checkDeviceImageCompatibility(
  context: CommandContext,
  chrootService: chromiumos.ChrootService,
  hostname: string,
  targetPackage: ParsedPackageName = {
    category: 'chromeos-base',
    name: 'libchrome',
  }
): Promise<{
  config: CheckerConfig;
  input: CheckerInput;
  output: CheckerOutput;
}> {
  const deviceAttributes = await context.deviceClient.getDeviceAttributes(
    hostname
  );

  let input;
  if (deviceAttributes instanceof Error) {
    const error = deviceAttributes;
    input = {
      targetPackage,
      device: error,
      local: {
        debugFlag: error,
        chromeosMajorVersion: error,
      },
    };
  } else {
    const board = Board.newBoard(deviceAttributes.board);

    const packageName = getQualifiedPackageName(targetPackage);
    const useFlags = await getUseFlagsInstalled(
      board,
      packageName,
      chrootService
    );

    const postsubmitVersions = await getCrosPrebuiltVersionsFromBinHost(
      board,
      chrootService
    );

    input = {
      targetPackage,
      device: deviceAttributes,
      local: {
        debugFlag:
          useFlags instanceof Error ? useFlags : useFlags.get('cros-debug'),
        chromeosMajorVersion:
          postsubmitVersions instanceof Error
            ? postsubmitVersions
            : Math.max(...postsubmitVersions.map(v => v.chromeOsMajor!)),
      },
    };
  }

  const config = {
    versionMaxSkew: deviceManagement.imageVersionMaxSkew.get(),
  };
  const output = new CompatibilityChecker(config, input).check();
  return {config, input, output};
}

function stringifyCheckerOutput(
  input: CheckerInput,
  result: CheckerOutput
): {
  title: string;
  details: string;
} {
  const title = `Device ${
    result.passed ? 'is' : 'may not be'
  } compatible with local ${
    input.device instanceof Error ? 'environment' : input.device.board
  }!`;

  const details = [result.results.debugFlag, result.results.version]
    .map(x => `${x.status}: ${x.description}`)
    .join('\n');

  return {title, details};
}

/*
 * Display result of image check given its input and output.
 * If the check had failed, prompt user for and returns their choice of follow-up action.
 * Otherwise (check had passed), do nothing and returns undefined.
 */
async function reportResultAndPromptActionOnFailedCheck(
  input: CheckerInput,
  output: CheckerOutput
): Promise<PostFailedImageCheckOptions | undefined> {
  const resultSummary = stringifyCheckerOutput(input, output);

  if (output.passed) {
    await vscode.window.showInformationMessage(resultSummary.title, {
      detail: resultSummary.details,
      modal: true,
    });
    return;
  }

  // vscode API assumes the list is ordered by priority of items.
  const options: vscode.MessageItem[] = [
    {
      title: PostFailedImageCheckOptions.FLASH_ANY_IMAGE_OPTION,
      isCloseAffordance: false,
    },
  ];
  // Suggestions are only available when the device and local environment attributes are known.
  if (
    !(
      input.device instanceof Error ||
      input.local.debugFlag instanceof Error ||
      input.local.chromeosMajorVersion instanceof Error
    )
  ) {
    // Add to start of array so that the option will be showed as default with more prominent visual
    // cue.
    options.unshift({
      title: PostFailedImageCheckOptions.FLASH_SUGGESTED_IMAGE_OPTION,
      isCloseAffordance: false,
    });
  }
  // Add option to open extension setting to update threshold only if the version check fails.
  if (output.results.version.status === 'FAILED') {
    options.push({
      title: PostFailedImageCheckOptions.OPEN_VERSION_THRESHOLD_OPTION,
      isCloseAffordance: false,
    });
  }
  // Add ignore error/failure option to the end.
  options.push({
    title: PostFailedImageCheckOptions.DEFAULT_IGNORE_WARNING_OPTION,
    isCloseAffordance: true,
  });

  return (
    await vscode.window.showWarningMessage(
      resultSummary.title,
      {
        detail: `${resultSummary.details}\nFlash device with a different image?`,
        modal: true,
      },
      ...options
    )
  )?.title as PostFailedImageCheckOptions;
}
