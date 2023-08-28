// Copyright 2023 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../common_util';
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
  async listAllPackages(board: string): Promise<ParsedPackageName[] | Error> {
    const args = [
      this.cros,
      'query',
      'ebuilds',
      '-b',
      board,
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
}
