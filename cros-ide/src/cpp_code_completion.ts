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
      await commonUtil.exec('cros_workon', ['--board', board, 'start', pkg],
          ideUtilities.getLogger().append);

      await runEmerge(board, pkg);

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

/** Runs emerge and shows a spinning progress indicator in the status bar. */
async function runEmerge(board: string, pkg: string): Promise<string> {
  return vscode.window.withProgress({
    location: vscode.ProgressLocation.Window,
    title: `Building refs for ${pkg}`,
    cancellable: false,
  }, (progress, token) => {
    return commonUtil.exec('env',
        ['USE=compilation_database', `emerge-${board}`, pkg],
        ideUtilities.getLogger().append, {logStdout: true});
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
