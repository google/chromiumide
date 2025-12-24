// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Board} from '../../../../shared/app/common/chromiumos/board_or_host/board';
import {getDriver} from '../../../../shared/app/common/driver_repository';
import {AbnormalExitError} from '../../../../shared/app/common/exec/types';
import {LruCache} from '../../../../shared/app/common/lru_cache';
import * as config from '../../../../shared/app/services/config';
import {parseQualifiedPackageName} from '../../../common/chromiumos/portage/ebuild';
import * as services from '../../../services';
import {
  listPackages,
  Package,
  packageCmp,
} from '../../chromiumos/boards_and_packages/package';
import {
  checkDeviceImageCompatibilityOrSuggest,
  CheckOutcome,
  ResultDisplayMode,
} from './check_image/check_image';
import {
  CommandContext,
  ensureSshSession,
  promptKnownHostnameIfNeeded,
  showMissingInternalRepoErrorMessage,
} from './common';

const driver = getDriver();

class QuickPickItemWithDescription implements vscode.QuickPickItem {
  constructor(
    readonly label: string,
    readonly description: string | undefined
  ) {}
}

const packageAsQuickPickItem = (p: Package) =>
  new QuickPickItemWithDescription(
    `${p.category}/${p.name}`,
    p.workon === 'started' ? '(workon)' : undefined
  );

const CACHE_CAPACITY = 10;
const GLOBAL_BOARD_TO_PACKAGE_CACHE = new LruCache<string, Package[]>(
  CACHE_CAPACITY
);

/**
 * Deployes a package to a device.
 *
 * @param chrootService If not given, shows an error message to open a chromiumos workspace.
 * @param selectedHostname If not given, shows a prompt to select a device.
 * @param selectedPackage If not given, shows a prompt to select a package.
 * @param selectedPackageBoard If given, compares the board with the selected device's board and
 * warns if those are different.
 */
export async function deployToDevice(
  context: CommandContext,
  chrootService?: services.chromiumos.ChrootService,
  selectedHostname?: string,
  selectedPackage?: string,
  selectedPackageBoard?: string
): Promise<void> {
  if (!chrootService) {
    void showMissingInternalRepoErrorMessage('Deploying package to device');
    return;
  }

  const hostname = await promptKnownHostnameIfNeeded(
    'Device to deploy package to',
    selectedHostname,
    context.deviceRepository
  );
  if (!hostname) return;

  // Reads the board name of the device and returns in case of a failure.
  const attributes = await context.deviceClient.getDeviceAttributes(hostname);
  const board =
    attributes instanceof Error
      ? await vscode.window.showInputBox({
          title: "Device's Board Name",
          value: '',
          prompt: 'Failed to get board from device, please input board name',
          ignoreFocusOut: true,
        })
      : attributes.board;
  if (!board) {
    return;
  }

  // Warn user if the command entry point is a package item belonging to a board different from the
  // selected device board.
  // Do not ban the action completely since most packages are common among boards.
  if (selectedPackageBoard && selectedPackageBoard !== board) {
    const option = await vscode.window.showQuickPick(
      ['Yes.', 'No, cancel deploy.'],
      {
        title: `Device board (${board}) is different from board of selected package (${selectedPackageBoard}). Are you sure to proceed?`,
      }
    );
    if (!option || option === 'No, cancel deploy.') return;
  }

  const targetPackage =
    selectedPackage ??
    (await promptTargetPackageWithCache(
      board,
      GLOBAL_BOARD_TO_PACKAGE_CACHE,
      () => loadPackagesOnBoard(board, context, chrootService)
    ));
  if (!targetPackage) return;

  // Check device is compatible with respect to device and package. User will be prompted to
  // optionally flash the device with a new image first if the check fails.
  // Abort this command if user cancels the check at any point, implying deploy package should also
  // be cancelled.
  const checkOutcome = await checkDeviceImageCompatibilityOrSuggest(
    context,
    chrootService,
    hostname,
    ResultDisplayMode.QUICKPICK,
    'No, deploy package directly.',
    parseQualifiedPackageName(targetPackage)
  );
  // Report on outcome to understand usefulness of the feature.
  driver.metrics.send({
    category: 'interactive',
    group: 'device',
    name: 'device_management_deploy_package',
    description: 'deploy package',
    package: targetPackage,
    outcome: checkOutcome instanceof Error ? 'error' : checkOutcome,
  });

  // Option to cancel deploy package command if the flashing step fails.
  if (checkOutcome instanceof Error) {
    const option = await vscode.window.showErrorMessage(
      'Failed to flash image to device, continue to deploy package?',
      'Yes',
      'No'
    );
    if (option === 'No') return;
  }

  if (checkOutcome === CheckOutcome.CANCELLED) {
    return;
  }

  // Port forwarding is necessary for connecting to device to run cros deploy from chroot.
  const port = await ensureSshSession(context, hostname);
  if (!port) return;
  const target = `localhost:${port}`;
  const res = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      cancellable: true,
      title: `Deploying ${targetPackage} to ${hostname}`,
    },
    async (_progress, token) => {
      return await chrootService.exec(
        'cros',
        ['deploy', target, targetPackage],
        {
          sudoReason: 'to deploy packages',
          logger: context.output,
          // Allow the user to see the logs during the command execution.
          logStdout: true,
          cancellationToken: token,
        }
      );
    }
  );

  if (res instanceof Error) {
    void (async () => {
      const choice = await vscode.window.showErrorMessage(
        res.message,
        'Open logs'
      );
      if (choice) {
        context.output.show();
      }
    })();
  } else {
    void vscode.window.showInformationMessage(
      `cros deploy ${targetPackage} to ${hostname} succeeded`
    );
  }

  // If the automated image compatibility check feature is not enabled and we should suggest that to
  // user (they did not choose 'never show again' in previous prompts).
  if (
    !config.seamlessDeployment.autoCheck.get() &&
    config.seamlessDeployment.suggestAutoCheck.get() &&
    // Exclude the case if user followed the suggestion but deploy still failed.
    !(
      res instanceof Error &&
      checkOutcome === CheckOutcome.FLASHED_FROM_SUGGESTION
    )
  ) {
    void (async () => {
      const choice = await vscode.window.showInformationMessage(
        'Do you want to let our new [seamless deployment](http://go/chromiumide-doc-seamless-deployment) feature automatically runs image check on newly added devices, and the default device on extension activation? You can always enable/disable it in the user settings page later.',
        'Yes',
        "Don't show again"
      );
      if (choice === 'Yes') {
        await config.seamlessDeployment.autoCheck.update(true);
      } else if (choice === "Don't show again") {
        await config.seamlessDeployment.suggestAutoCheck.update(false);
      }
      // Record user response to keep track of how popular the feature is.
      driver.metrics.send({
        category: 'interactive',
        group: 'device',
        name: 'seamless_deployment_enable_auto_check_prompt',
        description: 'prompt to enable seamless deployment auto check',
        enable: choice ?? 'dismissed',
      });
    })();
  }
}

/**
 * Prompts the packages available on the given board. This is exported only for testing purposes.
 *
 * @param boardToPackages Cache to skip expensive computation from the second time.
 * @param loadPackagesOrThrow A callback for actually listing the packages on the board.
 * @param onDidChangePickerItemsForTesting An event emitter that fires when quick pick items change.
 */
export async function promptTargetPackageWithCache(
  board: string,
  boardToPackages: LruCache<string, Package[]>,
  loadPackagesOrThrow: () => Promise<Package[] | Error>,
  onDidChangePickerItemsForTesting?: vscode.EventEmitter<
    readonly vscode.QuickPickItem[]
  >
): Promise<string | undefined> {
  const picker = vscode.window.createQuickPick();
  const subscriptions: vscode.Disposable[] = [];
  const task: Promise<string | undefined> = new Promise(resolve => {
    Object.assign(picker, {
      ignoreFocusOut: true,
      sortByLabel: false,
      title: 'Package to deploy',
      busy: true,
    });
    picker.items = [];

    const cachedPackages = boardToPackages.get(board);
    if (cachedPackages) {
      // Show cached packages to reduce user waiting time since `cros-workon list` could take a long
      // time.
      picker.items = cachedPackages.map(packageAsQuickPickItem);
      if (picker.items.length) {
        picker.busy = false;
      }

      onDidChangePickerItemsForTesting?.fire(picker.items);
    }

    subscriptions.push(
      picker.onDidAccept(() => {
        resolve(picker.activeItems[0].label);
      }),
      picker.onDidHide(() => {
        resolve(undefined);
      })
    );

    picker.show();

    // Update cache and the list of packages shown to user for selection.
    void loadPackagesOrThrow().then(packages => {
      if (packages instanceof Error) {
        if (cachedPackages) {
          // If there is a cached package list, show the cached list but warn user about it.
          void vscode.window.showWarningMessage(
            `Cached packages list are shown and might be outdated: ${packages.message}`
          );
          return;
        }
        if (
          // Handle the special case when board has not been set up yet and provide user with
          // actionable suggestion.
          packages instanceof AbnormalExitError &&
          packages.stderr.includes(
            `No such file or directory: '/build/${board}/etc'`
          )
        ) {
          void vscode.window.showErrorMessage(
            `Failed to get list of packages on ${board}: board has not been set up, run \`cros build-packages --board=${board}\`?`
          );
        } else {
          // Show the original error message as is.
          void vscode.window.showErrorMessage(
            `Failed to get list of packages on ${board}: ${packages.message}?`
          );
        }
        // Hide the picker as no meaningful suggestions can be made.
        picker.hide();
      } else {
        boardToPackages.set(board, packages);

        picker.items = packages.map(packageAsQuickPickItem);
        picker.busy = false;

        onDidChangePickerItemsForTesting?.fire(picker.items);
      }
    });
  });

  return task.finally(() => {
    picker.hide();
    picker.dispose();
    vscode.Disposable.from(...subscriptions).dispose();
  });
}

async function loadPackagesOnBoard(
  board: string,
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService
): Promise<Package[] | Error> {
  const allPackages = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: `Deploy Package: Getting list of packages on ${board}`,
    },
    async () => {
      return await listPackages(
        {chrootService: chrootService, output: context.output},
        Board.newBoard(board)
      );
    }
  );
  if (allPackages instanceof Error) {
    return allPackages;
  }
  return allPackages.sort(packageCmp);
}
