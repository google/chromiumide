// Copyright 2024 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {TextDocument, CancellationToken} from 'vscode';
import {findGitDir} from '../../../../../shared/app/common/common_util';
import {getDriver} from '../../../../../shared/app/common/driver_repository';
import {
  NoBoardError,
  getOrSelectDefaultBoard,
} from '../../../../../shared/app/features/default_board';
import {
  CompdbGenerator,
  ErrorDetails,
  ShouldGenerateResult,
} from '../../../../common/cpp_xrefs/types';
import {ChrootService} from '../../../../services/chromiumos';

const driver = getDriver();

type GenerationState = 'generating' | 'generated' | 'failed';

/**
 * Provides compilation database for C++ files under src/third_party/kernel.
 */
export class Kernel implements CompdbGenerator {
  constructor(
    private readonly chrootService: ChrootService,
    private readonly output: vscode.OutputChannel
  ) {}

  readonly name = 'kernel';

  // Packages for which compdb has been or being generated in this session.
  // Keyed by git directory.
  private readonly generationStates = new Map<string, GenerationState>();

  async shouldGenerate(document: TextDocument): Promise<ShouldGenerateResult> {
    if (!['cpp', 'c'].includes(document.languageId)) {
      return ShouldGenerateResult.NoUnsupported;
    }

    const gitDir = await findGitDir(document.fileName);
    if (!gitDir) return ShouldGenerateResult.NoUnsupported;

    const kernelDir = path.dirname(gitDir);
    if (!kernelDir.endsWith('src/third_party/kernel')) {
      return ShouldGenerateResult.NoUnsupported;
    }

    switch (this.generationStates.get(gitDir)) {
      case undefined:
        return ShouldGenerateResult.Yes;
      case 'generated': {
        if (!fs.existsSync(compdbPath(gitDir))) {
          // Corner case: compdb was generated but then manually removed. In
          // this case we can safely rerun the same command and regenerate it.
          return ShouldGenerateResult.Yes;
        }
        return ShouldGenerateResult.NoNeedNoChange;
      }
      case 'generating':
        return ShouldGenerateResult.NoGenerating;
      case 'failed':
        // We don't retry the generation if it fails. Instead we instruct the
        // user to manually fix the problem and then reload the IDE through the
        // error message.
        return ShouldGenerateResult.NoHasFailed;
    }
  }

  async generate(
    document: TextDocument,
    token: CancellationToken
  ): Promise<void> {
    driver.metrics.send({
      category: 'background',
      group: 'cppxrefs',
      name: 'cppxrefs_will_generate_compdb_on_kernel',
      description: 'interact with kernel files supporting xrefs',
    });

    const gitDir = await findGitDir(document.fileName);
    if (!gitDir) return;

    const previousState = this.generationStates.get(gitDir);
    this.generationStates.set(gitDir, 'generating');

    const result = await this.generateInner(gitDir, token);
    if (result instanceof Error) {
      if (token.isCancellationRequested) {
        if (!previousState) {
          this.generationStates.delete(gitDir);
        } else {
          this.generationStates.set(gitDir, previousState);
        }
        return;
      }
      this.generationStates.set(gitDir, 'failed');
      throw result;
    }

    this.generationStates.set(gitDir, 'generated');
  }

  private async generateInner(
    gitDir: string,
    token: vscode.CancellationToken
  ): Promise<undefined | ErrorDetails> {
    const chroot = this.chrootService.chroot;
    const board = await getOrSelectDefaultBoard(chroot);

    if (board instanceof NoBoardError) {
      return new ErrorDetails('no board', board.message);
    }
    if (board === undefined) {
      return new ErrorDetails('no board', 'Board not selected');
    }

    const {pkg, outputPath} = emergeConfig(gitDir, board.toString());

    const previousTimestamp = await fs.promises
      .stat(outputPath)
      .then(x => x.mtimeMs)
      .catch(() => 0);

    // Rerefence: http://yaqs/3690400827467366400#a1
    const emergeResult = await this.chrootService.exec(
      'env',
      ['USE=compilation_database', `emerge-${board}`, pkg],
      {
        sudoReason: 'to generate C++ compilation database',
        logger: this.output,
        logStdout: true,
        cancellationToken: token,
      }
    );
    if (emergeResult instanceof Error) {
      return new ErrorDetails(
        'command failure',
        `Command to generate compilation database failed: ${emergeResult.message}`
      );
    }

    const currentTimestamp = await fs.promises
      .stat(outputPath)
      .then(x => x.mtimeMs)
      .catch(() => 0);

    if (currentTimestamp <= previousTimestamp) {
      return new ErrorDetails(
        'not generated',
        `compilation database was not generated in ${outputPath} or is stale`
      );
    }

    const destination = compdbPath(gitDir);
    try {
      await fs.promises.copyFile(outputPath, destination);
    } catch (e) {
      return new ErrorDetails(
        'copy failure',
        `failed to copy compilation database: cp ${outputPath} ${destination}`
      );
    }
  }
}

function compdbPath(gitDir: string) {
  return path.join(gitDir, 'compile_commands.json');
}

/**
 * Computes the portage package to build and the filepath of the compdb that would be generated by
 * emerge-ing the package.
 */
function emergeConfig(
  gitDir: string,
  board: string
): {
  pkg: string;
  outputPath: string;
} {
  const root = path.normalize(
    path.join(gitDir, '../../../../out/build', board.toString())
  );

  const basename = path.basename(gitDir);

  const m = /^v(\d+)\.(\d+)(-arcvm)?$/.exec(basename);

  // v5.10-arcvm -> arcvm-kernel-ack-5_10
  if (m?.[3]) {
    const pkg = `sys-kernel/arcvm-kernel-ack-${m[1]}_${m[2]}`;
    return {
      pkg,
      outputPath: path.join(
        root,
        'var/cache/portage',
        pkg,
        'compile_commands_no_chroot.json'
      ),
    };
  }

  // v4.14    -> 4_14
  // upstream -> upstream
  const v = m ? `${m[1]}_${m[2]}` : basename;
  return {
    pkg: `sys-kernel/chromeos-kernel-${v}`,
    outputPath: path.join(root, 'build/kernel/compile_commands_no_chroot.json'),
  };
}
