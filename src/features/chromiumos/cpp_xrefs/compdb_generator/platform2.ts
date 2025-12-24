// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {getDriver} from '../../../../../shared/app/common/driver_repository';
import {assertNever} from '../../../../../shared/app/common/typecheck';
import {getOrPromptToSelectDefaultBoard} from '../../../../../shared/app/features/default_board';
import * as config from '../../../../../shared/app/services/config';
import {
  CompdbGeneratorCore,
  GenerationScope,
} from '../../../../common/cpp_xrefs/generic_compdb_generator';
import {ErrorDetails} from '../../../../common/cpp_xrefs/types';
import * as services from '../../../../services';
import {Packages} from '../../../../services/chromiumos';
import {
  CompdbError,
  CompdbErrorKind,
  CompdbService,
  CompdbServiceImpl,
  destination,
} from '../compdb_service';

const driver = getDriver();

export class Platform2 implements CompdbGeneratorCore {
  readonly name = 'platform2';

  readonly onDidChangeConfig = config.board.onDidChange;

  private readonly packages: Packages;

  constructor(
    private readonly chrootService: services.chromiumos.ChrootService,
    output: vscode.OutputChannel,
    private readonly compdbService: CompdbService = new CompdbServiceImpl(
      output,
      chrootService.crosFs
    )
  ) {
    this.packages = Packages.getOrCreate(this.chrootService);
  }

  async generationScope(
    document: vscode.TextDocument
  ): Promise<GenerationScope> {
    if (!['cpp', 'c', 'gn'].includes(document.languageId)) {
      return GenerationScope.Unsupported;
    }

    const gitDir = await driver.findGitDir(document.fileName);
    if (!gitDir?.endsWith('src/platform2')) {
      return GenerationScope.Unsupported;
    }
    const packageInfo = await this.packages.fromFilepath(document.fileName);
    if (!packageInfo) {
      return GenerationScope.Unsupported;
    }

    // Rebuild when a GN file is edited.
    if (document.languageId === 'gn') {
      return GenerationScope.Always;
    }

    // Send metrics if the user interacts with platform2 files for which we support xrefs.
    driver.metrics.send({
      category: 'background',
      group: 'cppxrefs',
      name: 'cppxrefs_interact_with_platform2_cpp',
      description: 'interact with platform2 files supporting xrefs',
    });

    return GenerationScope.InitOnly;
  }

  async compdbPath(document: vscode.TextDocument): Promise<string> {
    const packageInfo = await this.packages.fromFilepath(document.fileName);
    if (!packageInfo) {
      throw new Error(
        `Internal error: package info not found for ${document.fileName}`
      );
    }

    return destination(this.chrootService.chromiumos.root, packageInfo);
  }

  async generate(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<undefined | ErrorDetails | vscode.CancellationError> {
    const board = await getOrPromptToSelectDefaultBoard(
      this.chrootService.chroot.root
    );
    if (board instanceof Error) {
      return new ErrorDetails('no board', board.message);
    }
    if (board === undefined) {
      return new ErrorDetails('no board', 'Board not selected');
    }
    const packageInfo = (await this.packages.fromFilepath(document.fileName))!;

    try {
      // TODO(oka): use token to cancel the operation.
      await this.compdbService!.generate(board, packageInfo);
    } catch (e) {
      const error = e as CompdbError;
      switch (error.details.kind) {
        case CompdbErrorKind.RemoveCache:
          // TODO(oka): Add a button to open the terminal with the command to run.
          return new ErrorDetails(
            error.details.kind,
            `Failed to generate cross reference; try removing the file ${error.details.cache} and reload the IDE`
          );
        case CompdbErrorKind.RunEbuild: {
          return new ErrorDetails(
            error.details.kind,
            'Failed to generate cross reference; see go/chromiumide-doc-compdb-failure for troubleshooting',
            {
              label: 'Open',
              action: () => {
                void vscode.env.openExternal(
                  vscode.Uri.parse('http://go/chromiumide-doc-compdb-failure')
                );
              },
            }
          );
        }
        case CompdbErrorKind.NotGenerated:
          return new ErrorDetails(
            error.details.kind,
            'Failed to generate cross reference: compile_commands_chroot.json was not created; file a bug on go/chromiumide-new-bug',
            {
              label: 'File a bug',
              action: () => {
                void vscode.env.openExternal(
                  vscode.Uri.parse('http://go/chromiumide-new-bug')
                );
              },
            }
          );
        case CompdbErrorKind.CopyFailed:
          // TODO(oka): Add a button to open the terminal with the command to run.
          return new ErrorDetails(
            error.details.kind,
            `Failed to generate cross reference; try removing ${error.details.destination} and reload the IDE`
          );
        default:
          assertNever(error.details);
      }
    }
  }
}
