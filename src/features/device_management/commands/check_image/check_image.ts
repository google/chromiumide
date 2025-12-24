// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Board} from '../../../../../shared/app/common/chromiumos/board_or_host';
import {SudoError} from '../../../../../shared/app/common/exec/types';
import {seamlessDeployment} from '../../../../../shared/app/services/config';
import {
  getQualifiedPackageName,
  ParsedPackageName,
} from '../../../../common/chromiumos/portage/ebuild';
import {getUseFlagsInstalled} from '../../../../common/chromiumos/portage/equery';
import {getCrosPrebuiltVersionsFromBinHost} from '../../../../common/chromiumos/repo_status';
import {chromiumos} from '../../../../services';
import {
  CommandContext,
  promptKnownHostnameIfNeeded,
  showMissingInternalRepoErrorMessage,
} from '../common';
import {flashImageToDevice, flashPrebuiltImage} from '../flash_prebuilt_image';
import {CompatibilityChecker} from './compatibility';
import {showSuggestedImagesInputBox} from './suggest_image';
import {CheckerInput, CheckerConfig, CheckerOutput} from './types';

enum PostFailedImageCheckOptions {
  FLASH_SUGGESTED_IMAGE_OPTION = 'Flash image (from suggested list)',
  FLASH_ANY_IMAGE_OPTION = 'Flash image (manual)',
  OPEN_VERSION_THRESHOLD_OPTION = 'Edit version max skew',
  DEFAULT_IGNORE_WARNING_OPTION = 'Ignore',
}

/**
 * Represents the result of the checkDeviceImageCompatibilityOrSuggest function.
 */
export enum CheckOutcome {
  /** chrootService was not available and we couldn't start running check. */
  NOT_AVAILABLE = 'not available',
  /** The user explicitly cancelled an operation during its running. */
  CANCELLED = 'cancelled',
  /** Every check passed. */
  PASSED = 'passed',
  /** The image was incompatible, and the user flashed an image from the list IDE suggested. */
  FLASHED_FROM_SUGGESTION = 'flashed from suggested images',
  /** The image was incompatible, and the user flashed an arbitrary image from the menu. */
  FLASHED_FROM_MENU = 'flashed arbitrary image from menu',
  /** A suggestion to flash a new image was shown, but the user dismissed it. */
  SKIPPED_FLASH = 'skipped flash new image suggestion',
  /** The user opened settings for version max skew. */
  OPEN_VERSION_MAX_SKEW_CONFIG = 'open settings for version max skew',
}

export enum ResultDisplayMode {
  MODAL_MESSAGE,
  MESSAGE,
  QUICKPICK,
}

/*
 * Runs cros-debug flag and CrOS image version check on device image.
 * On failure, user may choose to flash device from list of suggested image or manually select one
 * via the usual flash image steps.
 *
 * Callsite can customize how result and follow-up action will be deplayed and collected depending
 * on the application:
 *   1. modal message: as a modal dialogue box that the user must addressed. Full check result will
 *      be shown. This should only be used when it is called as a stand-alone command since it is
 *      very disruptive.
 *   2. non-modal message: a small dialogue box at the corner. Full check result will be shown only
 *      if it fails. User can easily ignore it. This is suitable for running as non-urgent
        background checks.
 *   3. quick-pick: a quick pick menu. Only details of the failing subcheck(s) will be shown and
        only if the check fails. This is suitable for running as a part of another interactive
        command.
 * They may also customize the message for ignoring the warning and not flash a new image.
 * See `reportResultAndPromptActionOnFailedCheck`.
 *
 * Return the outcome of check (passed, or user action otherwise).
 *
 * TODO(hscham): call image check at extension activation time. It would run in background and
 * result will be displayed in MESSAGE mode.
 */
export async function checkDeviceImageCompatibilityOrSuggest(
  context: CommandContext,
  chrootService?: chromiumos.ChrootService,
  deviceHostname?: string,
  mode = ResultDisplayMode.MODAL_MESSAGE,
  ignoreWarningOption: string = PostFailedImageCheckOptions.DEFAULT_IGNORE_WARNING_OPTION,
  targetPackage: ParsedPackageName = {
    category: 'chromeos-base',
    name: 'libchrome',
  }
): Promise<CheckOutcome | Error> {
  if (!chrootService) {
    void showMissingInternalRepoErrorMessage(
      'Checking device image compatibility'
    );
    return CheckOutcome.NOT_AVAILABLE;
  }

  const hostname = await promptKnownHostnameIfNeeded(
    'Target Device',
    deviceHostname,
    context.deviceRepository
  );
  if (!hostname) {
    return CheckOutcome.CANCELLED;
  }

  const checkResult = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Checking ${hostname} compatibility with local environment...`,
    },
    async _progress => {
      return await checkDeviceImageCompatibility(
        context,
        chrootService,
        hostname,
        targetPackage
      );
    }
  );
  if (!checkResult) {
    return CheckOutcome.CANCELLED;
  }

  const {config, input, output} = checkResult;

  const option = await reportResultAndPromptActionOnFailedCheck(
    input,
    output,
    mode,
    ignoreWarningOption
  );

  // No follow-up action required if check passed.
  if (output.passed) return CheckOutcome.PASSED;

  if (option === undefined) return CheckOutcome.CANCELLED; // user dismissed a UI component

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
        chrootService.chromiumos.root,
        context.output
      );
      if (flashImageStatus instanceof Error) return flashImageStatus;
      if (flashImageStatus) return CheckOutcome.FLASHED_FROM_SUGGESTION;
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
    void seamlessDeployment.imageVersionMaxSkew.openSettings();
    return CheckOutcome.OPEN_VERSION_MAX_SKEW_CONFIG;
  }
  // User chose 'cancel' or not to do anything.
  return CheckOutcome.SKIPPED_FLASH;
}

/*
 * Runs cros-debug flag and CrOS image version check on device image and returns result of analysis.
 * The result could be converted into human readable message using checkImageResultToString().
 *
 * Returns undefined if user cancels the check.
 */
async function checkDeviceImageCompatibility(
  context: CommandContext,
  chrootService: chromiumos.ChrootService,
  hostname: string,
  targetPackage: ParsedPackageName
): Promise<
  | {
      config: CheckerConfig;
      input: CheckerInput;
      output: CheckerOutput;
    }
  | undefined
> {
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
      chrootService,
      `to get cros-debug flag of ${board.toBoardName()} and check device ${hostname} image compatibility`,
      context.output
    );
    if (useFlags instanceof Error) {
      context.output.show(); // reveal the logged command
    }
    // If user dismisses the sudo password prompt knowing it is for image compatibility check, they
    // do not want to continue with it.
    if (useFlags instanceof SudoError) {
      return undefined;
    }

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
    versionMaxSkew: seamlessDeployment.imageVersionMaxSkew.get(),
  };
  const output = new CompatibilityChecker(config, input).check();
  return {config, input, output};
}

function stringifyCheckerOutput(
  input: CheckerInput,
  result: CheckerOutput,
  showPassingResult: boolean
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
    .filter(x => (showPassingResult ? true : x.status !== 'PASSED'))
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
  output: CheckerOutput,
  mode: ResultDisplayMode,
  ignoreWarningOption: string
): Promise<PostFailedImageCheckOptions | undefined> {
  const resultSummary = stringifyCheckerOutput(
    input,
    output,
    // Simplify results (skip details of sub-test that passed) in quickpick mode since they will be
    // shown in placeholder which has limited space.
    mode !== ResultDisplayMode.QUICKPICK
  );

  // Show result when check passes only in modal message mode.
  // The other two modes implied it is not a stand alone command and should not interrupt workflow.
  if (output.passed) {
    if (mode === ResultDisplayMode.MODAL_MESSAGE) {
      await vscode.window.showInformationMessage(resultSummary.title, {
        detail: resultSummary.details,
        modal: true,
      });
    }
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
  // Add ignore error/failure option to the end.
  options.push({
    title: ignoreWarningOption,
    isCloseAffordance: true,
  });

  let option: string | undefined;
  if (mode === ResultDisplayMode.MODAL_MESSAGE) {
    // In modal message box, show title and details (with prompt) separately.
    option = (
      await vscode.window.showWarningMessage(
        resultSummary.title,
        {
          detail: [
            resultSummary.details,
            'Flash device with a different image?',
          ].join('\n'),
          modal: true,
        },
        ...options
      )
    )?.title;
  } else if (mode === ResultDisplayMode.MESSAGE) {
    // In non-modal message box, show title, details, and prompt as one message.
    option = await vscode.window.showWarningMessage(
      [
        resultSummary.title,
        resultSummary.details,
        'Flash device with a different image?',
      ].join('\n'),
      ...options.map(item => item.title)
    );
  } else {
    // In quickpick, show only title and prompt as title.
    // Supply additional details on why the check fails in the place holder.
    option = await vscode.window.showQuickPick(
      options.map(item => item.title),
      {
        title: [
          resultSummary.title,
          'Flash device with a different image first?',
        ].join('\n'),
        ignoreFocusOut: true,
        placeHolder: resultSummary.details,
      }
    );
  }
  if (option === ignoreWarningOption) {
    // If the user ignores the warning, maybe the version skew threshold is too strict for their
    // development workflow.
    // This prompt is shown as a non-modal message box regardless of the mode of the main prompt.
    if (output.results.version.status === 'FAILED') {
      option = await vscode.window.showInformationMessage(
        'Edit version skew threshold to reduce false image incompatibility warning?',
        PostFailedImageCheckOptions.OPEN_VERSION_THRESHOLD_OPTION,
        PostFailedImageCheckOptions.DEFAULT_IGNORE_WARNING_OPTION
      );
    } else {
      return PostFailedImageCheckOptions.DEFAULT_IGNORE_WARNING_OPTION;
    }
  }
  return option as PostFailedImageCheckOptions | undefined;
}
