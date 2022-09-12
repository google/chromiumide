// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import type * as vscode from 'vscode';
import * as commander from 'commander';
import * as cppCompdbService from '../../../features/cpp_code_completion/compdb_service';
import * as cppPackages from '../../../features/cpp_code_completion/packages';
import * as fakes from '../../testing/fakes';
import {chrootServiceInstance, packagesInstance} from './common';

const DEFAULT_BOARD = 'betty';

export function installCommand(program: commander.Command) {
  program
    .command('compdb')
    .description('generates compilation databases for files given from stdin')
    .action(main);
}

async function main() {
  const filepaths = (await fs.promises.readFile('/dev/stdin', 'utf8'))
    .trim()
    .split('\n');
  const output = new fakes.ConsoleOutputChannel();
  for (const filepath of filepaths) {
    const packageInfo = await packagesInstance().fromFilepath(filepath);
    if (!packageInfo) {
      continue;
    }
    await generate(packageInfo, output);
  }
}

/**
 * Generates compdb for the given package.
 */
export async function generate(
  packageInfo: cppPackages.PackageInfo,
  output: vscode.OutputChannel,
  board?: string
): Promise<void> {
  const chrootService = chrootServiceInstance();
  const compdbService = new cppCompdbService.CompdbServiceImpl(output, {
    chroot: chrootService.chroot()!,
    source: chrootService.source()!,
  });
  await compdbService.generate(board ?? DEFAULT_BOARD, packageInfo);
  return;
}
