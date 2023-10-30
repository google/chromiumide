// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../../../common/common_util';
import * as services from '../../../../services';
import * as config from '../../../../services/config';
import {CompdbGenerator, ErrorDetails, ShouldGenerateResult} from './types';

function getBoard() {
  return config.platformEc.board.get();
}

function getBuild() {
  return config.platformEc.build.get();
}

function getMode() {
  return config.platformEc.mode.get().toLowerCase();
}

const COMPILE_COMMANDS_JSON = 'compile_commands.json';

export class PlatformEc implements CompdbGenerator {
  readonly name = 'platform/ec';

  private readonly subscriptions: vscode.Disposable[] = [];
  private generatedBoard?: string;
  private generatedBuild?: string;
  private generatedMode?: string;

  constructor(
    private readonly chrootService: services.chromiumos.ChrootService,
    private readonly output: vscode.OutputChannel
  ) {}

  /**
   * Returns Yes for files in platform/ec unless compilation database has been
   * already generated for the same board in this session.
   */
  async shouldGenerate(
    document: vscode.TextDocument
  ): Promise<ShouldGenerateResult> {
    const gitDir = commonUtil.findGitDir(document.fileName);
    if (!gitDir?.endsWith('platform/ec')) {
      return ShouldGenerateResult.NoUnsupported;
    }

    if (!fs.existsSync(path.join(gitDir, COMPILE_COMMANDS_JSON))) {
      return ShouldGenerateResult.Yes;
    }

    return this.generatedBoard !== getBoard() ||
      this.generatedBuild !== getBuild() ||
      this.generatedMode !== getMode()
      ? ShouldGenerateResult.Yes
      : ShouldGenerateResult.NoNeedNoChange;
  }

  async generate(
    _document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const board = getBoard();
    const build = getBuild();
    const mode = getMode();
    const os = build === 'Makefile' ? 'ec' : 'zephyr';
    if (!board) {
      throw new ErrorDetails(
        'no board',
        'board not selected; set platformEC.board in Settings',
        {
          label: 'Open Settings',
          action: () => {
            void vscode.commands.executeCommand(
              'workbench.action.openSettings',
              '@ext:google.cros-ide platformEC.board'
            );
          },
        }
      );
    }

    const result = await this.chrootService.exec(
      'util/clangd_config.py',
      ['--os', os, board, mode],
      {
        crosSdkWorkingDir: '/mnt/host/source/src/platform/ec',
        sudoReason: 'to generate compilation database',
        logger: this.output,
      }
    );
    if (result instanceof Error) {
      throw new ErrorDetails(
        'util/clangd_config.py command failed',
        'Failed to generate compilation database',
        {
          label: 'Show log',
          action: () => {
            this.output.show();
          },
        }
      );
    }

    this.generatedBoard = board;
    this.generatedBuild = build;
    this.generatedMode = mode;
  }

  dispose(): void {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }
}
