// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import {execSudo} from '../../services/sudo';
import * as commonUtil from '../common_util';
import {BoardOrHost} from './board_or_host';
import {ParsedPackageName, parseQualifiedPackageName} from './portage/ebuild';

/**
 * Gets the path to the `cros` tool.
 */
export function getCrosPath(chromiumosRoot: string): string {
  return path.join(chromiumosRoot, 'chromite/bin/cros');
}

export class CrosClient {
  private readonly cros: string;
  constructor(
    private readonly chromiumosRoot: string,
    private readonly output: vscode.OutputChannel
  ) {
    this.cros = getCrosPath(chromiumosRoot);
  }

  /**
   * Lists all the packages available for the board. Results are deduplicated and sorted.
   */
  async listAllPackages(
    board: BoardOrHost
  ): Promise<ParsedPackageName[] | Error> {
    const args = [
      this.cros,
      'query',
      'ebuilds',
      '-b',
      board.toBoardName(),
      '-o',
      // Format string run against the Ebuild class in chromite/lib/build_query.py.
      '{package_info.atom}',
    ];

    const result = await commonUtil.exec(args[0], args.slice(1), {
      cwd: this.chromiumosRoot,
      logger: this.output,
    });
    if (result instanceof Error) return result;

    return [...new Set(result.stdout.trim().split('\n'))]
      .sort()
      .map(parseQualifiedPackageName);
  }

  /**
   * Lists cros-workon packages for the board. Results are deduplicated and sorted by name.
   */
  async listWorkonPackages(
    board: BoardOrHost,
    options?: {all?: boolean}
  ): Promise<ParsedPackageName[] | Error> {
    const args = [
      this.cros,
      'workon',
      ...board.map(b => ['-b', b], ['--host']),
      'list',
    ];
    if (options?.all) {
      args.push('--all');
    }
    const result = await execSudo(args[0], args.slice(1), {
      cwd: this.chromiumosRoot,
      logger: this.output,
      sudoReason: 'to list workon packages',
    });
    if (result instanceof Error) return result;

    return result.stdout.trim().split('\n').map(parseQualifiedPackageName);
  }
}
