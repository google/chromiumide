// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as commonUtil from './common/common_util';
import * as ideUtilities from './ide_utilities';

export function activate(context: vscode.ExtensionContext) {
  const manager = new commonUtil.JobManager<void>();

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(
      editor => {
        if (editor?.document.languageId === 'cpp') {
          generateCompilationDatabase(manager, editor.document);
        }
      },
  ));

  // Update compilation database when a GN file is updated.
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(
      document => {
        if (document.fileName.match(/\.gni?$/)) {
          generateCompilationDatabase(manager, document);
        }
      },
  ));

  const document = vscode.window.activeTextEditor?.document;
  if (document) {
    generateCompilationDatabase(manager, document);
  }
}

export interface PackageInfo {
  sourceDir: string, // directory containing source code relative to chromiumos/
  pkg: string, // package name
}

const MNT_HOST_SOURCE = '/mnt/host/source'; // realpath of ~/chromiumos

// Generate compilation database for clangd.
// TODO(oka): Add unit test.
async function generateCompilationDatabase(
    manager: commonUtil.JobManager<void>,
    document: vscode.TextDocument,
) {
  const packageInfo = await getPackage(document.fileName);
  if (!packageInfo) {
    return;
  }
  const {sourceDir, pkg} = packageInfo;

  const board = await ideUtilities.getOrSelectTargetBoard();
  if (!board) {
    return;
  }

  // Below, we create compilation database based on the project and the board.
  // Generating the database is time consuming involving execution of external
  // processes, so we ensure it to run only one at a time using the manager.
  await manager.offer(async () => {
    try {
      const {shouldRun, userConsent} = await shouldRunCrosWorkon(board, pkg);
      if (shouldRun && !userConsent) {
        return;
      }
      if (shouldRun) {
        await commonUtil.exec('cros_workon', ['--board', board, 'start', pkg],
            ideUtilities.getLogger().append);
      }

      const {error} = await runEmerge(board, pkg);
      if (error !== undefined) {
        vscode.window.showErrorMessage(error);
        return;
      }

      // Make the generated compilation database available from clangd.
      await commonUtil.exec(
          'ln', ['-sf', `/build/${board}/build/compilation_database/` +
        `${pkg}/compile_commands_chroot.json`,
          path.join(MNT_HOST_SOURCE, sourceDir, 'compile_commands.json')],
          ideUtilities.getLogger().append);
    } catch (e) {
      // TODO(oka): show error message for user to manually resolve problem
      // (e.g. compile error).
      ideUtilities.getLogger().appendLine((e as Error).message);
      console.error(e);
    }
  });
}

async function workonList(board: string): Promise<string[]> {
  const out = await commonUtil.exec('cros_workon', ['--board', board, 'list']);
  return out.split('\n').filter(x => x !== '');
}

export type PersistentConsent = 'Never' | 'Always'
export type UserConsent = PersistentConsent | 'Once';
export type UserChoice = PersistentConsent | 'Yes'

const NEVER: PersistentConsent = 'Never';
const ALWAYS: PersistentConsent = 'Always';
const YES: UserChoice = 'Yes';

async function getUserConsent(current: UserConsent, ask: () => Thenable<UserChoice | undefined>):
    Promise<{ok: boolean, remember?: PersistentConsent}> {
  switch (current) {
    case NEVER:
      return {ok: false};
    case ALWAYS:
      return {ok: true};
  }
  const choice = await ask();
  switch (choice) {
    case YES:
      return {ok: true};
    case NEVER:
      return {ok: false, remember: NEVER};
    case ALWAYS:
      return {ok: true, remember: ALWAYS};
    default:
      return {ok: false};
  }
}

const AUTO_CROS_WORKON_CONFIG = 'clangdSupport.crosWorkonPrompt';

/**
 * Returns whether to run cros_workon start for the board and pkg. If the package is already being
 * worked on, it returns shouldRun = false. Otherwise, in addition to shouldRun = true, it tries
 * getting user consent to run the command and fills userConsent.
 */
async function shouldRunCrosWorkon(board: string, pkg: string): Promise<{
  shouldRun: boolean,
  userConsent?: boolean,
}> {
  if ((await workonList(board)).includes(pkg)) {
    return {
      shouldRun: false,
    };
  }

  const currentChoice = ideUtilities.getConfigRoot().get<UserConsent>(
      AUTO_CROS_WORKON_CONFIG) || 'Once';

  const showPrompt = async () => {
    const choice = await Promise.race([
      vscode.window.showInformationMessage(`Generating cross references requires 'cros_workon ` +
        `--board=${board} start ${pkg}'. Proceed?`, {}, YES, ALWAYS, NEVER),
      // Make sure showPrompt returns. showInformationMessage doesn't resolve nor reject if the
      // prompt is dismissed due to timeout (about 15 seconds).
      new Promise(resolve => {
        setTimeout(() => resolve(undefined), 30 * 1000);
      }),
    ]);
    return choice as UserChoice | undefined;
  };
  const {ok, remember} = await getUserConsent(currentChoice, showPrompt);
  if (remember) {
    ideUtilities.getConfigRoot().update(AUTO_CROS_WORKON_CONFIG, remember,
        vscode.ConfigurationTarget.Global);
  }
  return {
    shouldRun: true,
    userConsent: ok,
  };
}

/** Runs emerge and shows a spinning progress indicator in the status bar. */
function runEmerge(board: string, pkg: string): Thenable<{error?: string}> {
  return vscode.window.withProgress({
    location: vscode.ProgressLocation.Window,
    title: `Building refs for ${pkg}`,
    cancellable: false,
  }, (progress, token) => {
    async function f() {
      try {
        await commonUtil.exec('env',
            ['USE=compilation_database', `emerge-${board}`, pkg],
            ideUtilities.getLogger().append, {logStdout: true});
        return {};
      } catch (error) {
        // TODO(b/223534220): Use error after the error message becomes useful.
        return {error: `emerge-${board} ${pkg} failed`};
      }
    };
    return f();
  });
}

// Known source code location to package name mapping which supports
// compilation database generation.
const KNOWN_PACKAGES: Array<PackageInfo> = [
  ['src/aosp/frameworks/ml', 'chromeos-base/aosp-frameworks-ml-nn'],
  ['src/aosp/frameworks/ml/chromeos/tests',
    'chromeos-base/aosp-frameworks-ml-nn-vts'],
  ['src/platform2/camera/android', 'chromeos-base/cros-camera-android-deps'],
  ['src/platform2/camera/camera3_test', 'media-libs/cros-camera-test'],
  ['src/platform2/camera/common', 'chromeos-base/cros-camera-libs'],
  ['src/platform2/camera/common/jpeg/libjea_test',
    'media-libs/cros-camera-libjea_test'],
  ['src/platform2/camera/common/libcamera_connector_test',
    'media-libs/cros-camera-libcamera_connector_test'],
  ['src/platform2/camera/features/document_scanning',
    'media-libs/cros-camera-document-scanning-test'],
  ['src/platform2/camera/hal_adapter', 'chromeos-base/cros-camera'],
  ['src/platform2/camera/hal/usb', 'media-libs/cros-camera-hal-usb'],
  ['src/platform2/camera/hal/usb/tests', 'media-libs/cros-camera-usb-tests'],
  ['src/platform2/camera/tools/cros_camera_tool',
    'chromeos-base/cros-camera-tool'],
  ['src/platform2/cros-disks', 'chromeos-base/cros-disks'],
  ['src/platform2/hps', 'chromeos-base/hpsd'],
  ['src/platform2/hps/util', 'chromeos-base/hps-tool'],
  ['src/platform2/lorgnette', 'chromeos-base/lorgnette'],
  ['src/platform2/shill', 'chromeos-base/shill'],
  ['src/platform2/vm_tools', 'chromeos-base/vm_host_tools'],
].map(([sourceDir, pkg]) => {
  return {
    sourceDir,
    pkg,
  };
});
Object.freeze(KNOWN_PACKAGES);

// Get information of the package that would compile the file and generates
// compilation database, or null if no such package is known.
export async function getPackage(filepath: string,
    mntHostSource: string = MNT_HOST_SOURCE): Promise<PackageInfo | null> {
  let realpath = '';
  try {
    realpath = await fs.promises.realpath(filepath);
  } catch (_e) {
    return null;
  }
  const relPath = path.relative(mntHostSource, realpath);
  if (relPath.startsWith('..') || path.isAbsolute(relPath)) {
    return null;
  }
  let res = null;
  for (const pkg of KNOWN_PACKAGES) {
    if (relPath.startsWith(pkg.sourceDir + '/') &&
      (res === null || res.sourceDir.length < pkg.sourceDir.length)) {
      res = pkg;
    }
  }
  return res;
}

export const TEST_ONLY = {
  ALWAYS, NEVER, YES,
  getUserConsent,
};
