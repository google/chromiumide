// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as vscode from 'vscode';
import * as commonUtil from '../../../../common/common_util';
import {getOrSelectTargetBoard, NoBoardError} from '../../../../ide_util';
import * as services from '../../../../services';
import * as metrics from '../../../metrics/metrics';
import {
  CompdbError,
  CompdbErrorKind,
  CompdbService,
  CompdbServiceImpl,
  destination,
} from '../compdb_service';
import {Atom, Packages} from '../../../../services/chromiumos';
import {CompdbGenerator, ErrorDetails} from '.';

type GenerationState = 'generating' | 'generated' | 'failed';

export class Platform2 implements CompdbGenerator {
  readonly name = 'platform2';

  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly packages: Packages;
  // Packages for which compdb has been or being generated in this session.
  private readonly generationStates = new Map<Atom, GenerationState>();

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

  /**
   * Returns true for files in platform2 that belong to some package. GN files always return true,
   * whereas for C/C++ we generate xrefs only if we haven't done it in the current session.
   */
  async shouldGenerate(document: vscode.TextDocument): Promise<boolean> {
    const gitDir = commonUtil.findGitDir(document.fileName);
    if (!gitDir?.endsWith('src/platform2')) {
      return false;
    }
    const packageInfo = await this.packages.fromFilepath(document.fileName);
    if (!packageInfo) {
      return false;
    }

    // Send metrcis if the user interacts with platform2 files for which we support
    // xrefs.
    if (['cpp', 'c'].includes(document.languageId)) {
      metrics.send({
        category: 'background',
        group: 'cppxrefs',
        name: 'cppxrefs_interact_with_platform2_cpp',
        description: 'interact with platform2 files supporting xrefs',
      });
    }

    // Rebuild when a GN file is edited.
    if (document.languageId === 'gn') {
      return true;
    }

    if (!['cpp', 'c'].includes(document.languageId)) {
      return false;
    }

    switch (this.generationStates.get(packageInfo.atom)) {
      case undefined:
        return true;
      case 'generated': {
        const source = this.chrootService.source;
        if (!fs.existsSync(destination(source.root, packageInfo))) {
          // Corner case: compdb was generated but then manually removed. In
          // this case we can safely rerun the same command and regenerate it.
          return true;
        }
        return false;
      }
      case 'generating':
      case 'failed':
        // We don't retry the generation if it fails. Instead we instruct the
        // user to manually fix the problem and then reload the IDE through the
        // error message.
        return false;
    }
  }

  async generate(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const chroot = this.chrootService.chroot;
    const board = await getOrSelectTargetBoard(chroot);
    if (board instanceof NoBoardError) {
      throw new ErrorDetails('no board', board.message);
    }
    if (board === null) {
      throw new ErrorDetails('no board', 'Board not selected');
    }
    const packageInfo = (await this.packages.fromFilepath(document.fileName))!;

    this.generationStates.set(packageInfo.atom, 'generating');

    try {
      // TODO(oka): use token to cancel the operation.
      await this.compdbService!.generate(board, packageInfo);

      this.generationStates.set(packageInfo.atom, 'generated');
    } catch (e) {
      this.generationStates.set(packageInfo.atom, 'failed');

      const error = e as CompdbError;
      switch (error.details.kind) {
        case CompdbErrorKind.RemoveCache:
          // TODO(oka): Add a button to open the terminal with the command to run.
          throw new ErrorDetails(
            error.details.kind,
            `Failed to generate cross reference; try removing the file ${error.details.cache} and reload the IDE`
          );
        case CompdbErrorKind.RunEbuild: {
          throw new ErrorDetails(
            error.details.kind,
            'Failed to generate cross reference; see go/cros-ide-doc-compdb-failure for troubleshooting',
            {
              label: 'Open',
              action: () => {
                void vscode.env.openExternal(
                  vscode.Uri.parse('http://go/cros-ide-doc-compdb-failure')
                );
              },
            }
          );
        }
        case CompdbErrorKind.NotGenerated:
          throw new ErrorDetails(
            error.details.kind,
            'Failed to generate cross reference: compile_commands_chroot.json was not created; file a bug on go/cros-ide-new-bug',
            {
              label: 'File a bug',
              action: () => {
                void vscode.env.openExternal(
                  vscode.Uri.parse('http://go/cros-ide-new-bug')
                );
              },
            }
          );
        case CompdbErrorKind.CopyFailed:
          // TODO(oka): Add a button to open the terminal with the command to run.
          throw new ErrorDetails(
            error.details.kind,
            `Failed to generate cross reference; try removing ${error.details.destination} and reload the IDE`
          );
        default:
          ((_: never) => {})(error.details);
      }
    }
  }

  dispose() {
    vscode.Disposable.from(...this.subscriptions).dispose();
  }
}
