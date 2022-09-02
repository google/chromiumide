// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import {getOrSelectTargetBoard, NoBoardError} from '../../ide_util';
import {ChrootService} from '../../services/chroot';
import * as metrics from '../../features/metrics/metrics';
import {CompdbGenerator, ErrorDetails} from './compdb_generator';
import {
  CompdbError,
  CompdbErrorKind,
  CompdbService,
  CompdbServiceImpl,
  destination,
} from './compdb_service';
import {Atom, Packages} from './packages';

export class Platform2CompdbGenerator implements CompdbGenerator {
  readonly name = 'platform2';

  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly packages: Packages;
  // Packages for which compdb has been generated in this session.
  private readonly generated = new Set<Atom>();

  constructor(
    private readonly chrootService: ChrootService,
    output: vscode.OutputChannel,
    private compdbService?: CompdbService
  ) {
    this.packages = new Packages(chrootService, true);
    this.subscriptions.push(
      chrootService.onDidActivate(crosFs => {
        if (!this.compdbService) {
          this.compdbService = new CompdbServiceImpl(output, crosFs);
        }
      })
    );
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

    // Rebuild when a GN file is edited.
    if (document.languageId === 'gn') {
      return true;
    }

    if (!['cpp', 'c'].includes(document.languageId)) {
      return false;
    }

    if (!this.generated.has(packageInfo.atom)) {
      return true;
    }

    const source = this.chrootService.source();
    if (!source) {
      // Let `generate` be called and an error be thrown.
      return true;
    }
    if (!fs.existsSync(destination(source.root, packageInfo))) {
      return true;
    }

    return false;
  }

  async generate(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const chroot = this.chrootService.chroot();
    if (!chroot) {
      this.throwForNoChroot(document.fileName);
    }
    const board = await getOrSelectTargetBoard(chroot);
    if (board instanceof NoBoardError) {
      throw new ErrorDetails('no board', board.message);
    }
    if (board === null) {
      throw new ErrorDetails('no board', 'Board not selected');
    }
    const packageInfo = (await this.packages.fromFilepath(document.fileName))!;

    try {
      // TODO(oka): use token to cancel the operation.
      await this.compdbService!.generate(board, packageInfo);
      this.generated.add(packageInfo.atom);
    } catch (e) {
      const error = e as CompdbError;
      switch (error.details.kind) {
        case CompdbErrorKind.RemoveCache:
          // TODO(oka): Add a button to open the terminal with the command to run.
          throw new ErrorDetails(
            error.details.kind,
            `Failed to generate cross reference; try removing the file ${error.details.cache} and reload the IDE`
          );
        case CompdbErrorKind.RunEbuild: {
          const buildPackages = `build_packages --board=${board}`;
          throw new ErrorDetails(
            error.details.kind,
            `Failed to generate cross reference; try running "${buildPackages}" in chroot and reload the IDE`,
            {
              label: 'Open document',
              action: () => {
                void vscode.env.openExternal(
                  vscode.Uri.parse(
                    'https://chromium.googlesource.com/chromiumos/docs/+/HEAD/developer_guide.md#build-the-packages-for-your-board'
                  )
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

  private throwForNoChroot(fileName: string): never {
    // Send metrics before showing the message, because they don't seem
    // to be sent if the user does not act on the message.
    metrics.send({
      category: 'background',
      group: 'misc',
      action: 'cpp xrefs generation without chroot',
    });

    // platform2 user may prefer subdirectories
    const gitFolder = commonUtil.findGitDir(fileName);

    const openOtherFolder = gitFolder ? 'Open Other' : 'Open Folder';

    const buttons = [];
    if (gitFolder) {
      buttons.push({
        label: `Open ${gitFolder}`,
        action: () => {
          void vscode.commands.executeCommand('vscode.openFolder');
        },
      });
    }
    buttons.push({
      label: openOtherFolder,
      action: () => {
        void vscode.commands.executeCommand('vscode.openFolder');
      },
    });

    throw new ErrorDetails(
      'no chroot',
      'Generating C++ xrefs requires opening a folder with CrOS sources.',
      ...buttons
    );
  }
}
