// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {Board} from '../../../common/chromiumos/board_or_host/board';
import {parseQualifiedPackageName} from '../../../common/chromiumos/portage/ebuild';
import {LruCache} from '../../../common/lru_cache';
import * as services from '../../../services';
import {
  listPackages,
  Package,
  packageCmp,
} from '../../chromiumos/boards_and_packages/package';
import {Metrics} from '../../metrics/metrics';
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

// TODO(b/308059094): add command entry point from boards and packages panel.
export async function deployToDevice(
  context: CommandContext,
  chrootService?: services.chromiumos.ChrootService,
  selectedHostname?: string,
  selectedPackage?: string
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

  const targetPackage =
    selectedPackage ??
    (await promptTargetPackageWithCache(
      board,
      GLOBAL_BOARD_TO_PACKAGE_CACHE,
      () => loadPackagesOnBoardOrThrow(board, context, chrootService)
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
  Metrics.send({
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
    return;
  }
  void vscode.window.showInformationMessage(
    `cros deploy ${targetPackage} to ${hostname} succeeded`
  );
}

export async function promptTargetPackageWithCache(
  board: string,
  boardToPackages: LruCache<string, Package[]>,
  loadPackagesOrThrow: () => Promise<Package[]>,
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
    });
    picker.items = [];

    const cachedPackages = boardToPackages.get(board);
    if (cachedPackages) {
      // Show cached packages to reduce user waiting time since `cros-workon list` could take a long
      // time.
      picker.items = cachedPackages.map(packageAsQuickPickItem);
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
    void loadPackagesOrThrow()
      .then(packages => {
        boardToPackages.set(board, packages);
        picker.items = packages.map(packageAsQuickPickItem);
        onDidChangePickerItemsForTesting?.fire(picker.items);
      })
      .catch(e => {
        // If there is a cached package list
        if (cachedPackages) {
          void vscode.window.showWarningMessage(
            `Cached packages list are shown and might be outdated: ${e}`
          );
        } else {
          void vscode.window.showErrorMessage(e);
        }
      });
  });

  return task.finally(() => {
    picker.hide();
    picker.dispose();
    vscode.Disposable.from(...subscriptions).dispose();
  });
}

async function loadPackagesOnBoardOrThrow(
  board: string,
  context: CommandContext,
  chrootService: services.chromiumos.ChrootService
): Promise<Package[]> {
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
    throw new Error(
      `Failed to get list of packages on board ${board}: ${allPackages.message}`
    );
  }
  return allPackages.sort(packageCmp);
}
