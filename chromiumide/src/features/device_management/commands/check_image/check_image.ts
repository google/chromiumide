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
import {flashPrebuiltImage} from '../flash_prebuilt_image';
import {CompatibilityChecker} from './compatibility';
import {CheckerInput, CheckerConfig, CheckerOutput} from './types';

const FLASH_ANY_IMAGE_OPTION = 'Yes, show flash image menu.';
const OPEN_VERSION_THRESHOLD_OPTION =
  'No, open extension config to change version skew threshold.';

export enum CheckOutcome {
  CANCELLED = 'cancelled',
  PASSED = 'passed',
  FLASHED_FROM_MENU = 'flashed arbitrary image from menu',
  SKIPPED_FLASH = 'skipped flash new image suggestion',
  OPEN_VERSION_MAX_SKEW_CONFIG = 'open settings for version max skew',
}

/*
 * Runs cros-debug flag and CrOS image version check on device image.
 * Returns whether the check passed and user action otherwise.
 * TODO(hscham): Suggest new image to flash if deemed incompatible.
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
  const {input, output} = await vscode.window.withProgress(
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

  const resultSummary = stringifyCheckerOutput(input, output);

  if (output.passed) {
    await vscode.window.showInformationMessage(resultSummary.title, {
      detail: resultSummary.details,
      modal: true,
    });
    return CheckOutcome.PASSED;
  }

  // TODO(hscham) Implement a simpler choice where user can choose from a list of images with item
  // 'Yes, choose from list of suggested images.'
  const options = [FLASH_ANY_IMAGE_OPTION];
  if (output.results.version.status === 'FAILED') {
    // Add option to open extension setting to update threshold only if the version check fails.
    options.push(OPEN_VERSION_THRESHOLD_OPTION);
  }

  const option = await vscode.window.showWarningMessage(
    resultSummary.title,
    {
      detail: `${resultSummary.details}\nFlash device with a different image?`,
      modal: true,
    },
    ...options
  );
  if (option === FLASH_ANY_IMAGE_OPTION) {
    const flashImageStatus = await flashPrebuiltImage(
      context,
      chrootService,
      hostname
    );
    if (flashImageStatus instanceof Error) return flashImageStatus;
    if (flashImageStatus) return CheckOutcome.FLASHED_FROM_MENU;
  } else if (option === OPEN_VERSION_THRESHOLD_OPTION) {
    void deviceManagement.imageVersionMaxSkew.openSettings();
    return CheckOutcome.OPEN_VERSION_MAX_SKEW_CONFIG;
  }
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
