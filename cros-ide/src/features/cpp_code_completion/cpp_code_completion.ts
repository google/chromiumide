// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import * as metrics from '../../features/metrics/metrics';
import * as ideUtil from '../../ide_util';
import {ChrootService} from '../../services/chroot';
import * as config from '../../services/config';
import * as bgTaskStatus from '../../ui/bg_task_status';
import * as compdbService from './compdb_service';
import {
  CompdbError,
  CompdbErrorKind,
  CompdbService,
  CompdbServiceImpl,
} from './compdb_service';
import {CLANGD_EXTENSION, SHOW_LOG_COMMAND} from './constants';
import {Atom, PackageInfo, Packages} from './packages';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  chrootService: ChrootService
) {
  context.subscriptions.push(
    chrootService.onDidActivate(crosFs => {
      const output = vscode.window.createOutputChannel('CrOS IDE: C++ Support');
      context.subscriptions.push(
        vscode.commands.registerCommand(SHOW_LOG_COMMAND.command, () =>
          output.show()
        )
      );

      const compdbService = new CompdbServiceImpl(output, crosFs);

      const useHardcodedMapping =
        config.cppCodeCompletion.useHardcodedMapping.get();
      context.subscriptions.push(
        new CompilationDatabase(
          statusManager,
          new Packages(chrootService, !useHardcodedMapping),
          output,
          compdbService,
          chrootService
        )
      );
    })
  );
}

const STATUS_BAR_TASK_NAME = 'C++ xrefs generation';

export class CompilationDatabase implements vscode.Disposable {
  private readonly jobManager = new commonUtil.JobManager<void>();
  private readonly disposables: vscode.Disposable[] = [];
  // Packages for which compdb has been generated in this session.
  private readonly generated = new Set<Atom>();
  // Store errors to avoid showing the same error many times.
  private readonly ignoredError: Set<CompdbErrorKind> = new Set();

  // Indicates CompilationDatabase activated clangd
  // (it might have been already activated independently, in which case we will
  // activate it again - not ideal, but not a problem either).
  private clangdActivated = false;

  // Ensures that error message about no chroot is shown only once.
  private noChrootHandled = false;

  // Callbacks called after an event has been handled.
  readonly onEventHandledForTesting = new Array<() => void>();

  constructor(
    private readonly statusManager: bgTaskStatus.StatusManager,
    private readonly packages: Packages,
    private readonly log: vscode.OutputChannel,
    private readonly compdbService: CompdbService,
    private readonly chrootService: ChrootService
  ) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(async editor => {
        if (editor?.document.languageId === 'cpp') {
          await this.maybeGenerate(
            editor.document,
            /* skipIfAlreadyGenerated = */ true
          );
        }
        this.onEventHandledForTesting.forEach(f => f());
      })
    );

    // Update compilation database when a GN file is updated.
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(async document => {
        if (document.fileName.match(/\.gni?$/)) {
          await this.maybeGenerate(document, false);
        }
        this.onEventHandledForTesting.forEach(f => f());
      })
    );

    const document = vscode.window.activeTextEditor?.document;
    if (document) {
      void this.maybeGenerate(document, false);
    }
  }

  dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // Generate compilation database for clangd if needed.
  private async maybeGenerate(
    document: vscode.TextDocument,
    skipIfAlreadyGenerated: boolean
  ) {
    if (!(await this.ensureClangdIsActivated())) {
      return;
    }
    const packageInfo = await this.packages.fromFilepath(document.fileName);
    if (!packageInfo) {
      return;
    }
    if (!this.shouldGenerate(packageInfo, skipIfAlreadyGenerated)) {
      return;
    }
    if (!this.chrootService.chroot()) {
      await this.handleNoChroot(document.fileName);
      return;
    }
    const board = await this.board();
    if (!board) {
      return;
    }

    await this.generate(board, packageInfo);
  }

  private async ensureClangdIsActivated() {
    if (this.clangdActivated) {
      return true;
    }

    const clangd = vscode.extensions.getExtension(CLANGD_EXTENSION);
    if (!clangd) {
      return false;
    }

    // Make sure the extension is activated, because we want to call 'clangd.restart'.
    await clangd.activate();
    this.clangdActivated = true;
    return true;
  }

  private shouldGenerate(
    packageInfo: PackageInfo,
    skipIfAlreadyGenerated: boolean
  ): boolean {
    if (!skipIfAlreadyGenerated || !this.generated.has(packageInfo.atom)) {
      return true;
    }
    const source = this.chrootService.source();
    if (
      source &&
      !fs.existsSync(compdbService.destination(source.root, packageInfo))
    ) {
      return true;
    }
    return false;
  }

  private async handleNoChroot(fileName: string) {
    if (this.noChrootHandled) {
      return;
    }
    this.noChrootHandled = true;

    // Send metrics before showing the message, because they don't seem
    // to be sent if the user does not act on the message.
    metrics.send({
      category: 'background',
      group: 'misc',
      action: 'cpp xrefs generation without chroot',
    });

    // platform2 user may prefer subdirectories
    const gitFolder = await this.getGitTopLevelDirectory(fileName);

    const openGitFolder = gitFolder ? `Open ${gitFolder}` : undefined;
    const openOtherFolder = gitFolder ? 'Open Other' : 'Open Folder';

    const buttons = openGitFolder ? [openGitFolder] : [];
    buttons.push(openOtherFolder);

    const selection = await vscode.window.showErrorMessage(
      'Generating C++ xrefs requires opening a folder with CrOS sources.',
      ...buttons
    );

    if (selection === openOtherFolder) {
      await vscode.commands.executeCommand('vscode.openFolder');
    } else if (gitFolder && selection === openGitFolder) {
      await vscode.commands.executeCommand(
        'vscode.openFolder',
        vscode.Uri.file(gitFolder)
      );
    }
  }

  /** Get top directory of the repo for the `fileName`. Errors are ignored. */
  private async getGitTopLevelDirectory(
    fileName: string
  ): Promise<string | undefined> {
    const fileDir = path.dirname(fileName);
    const result = await commonUtil.exec(
      'git',
      ['rev-parse', '--show-toplevel'],
      {cwd: fileDir}
    );
    if (result instanceof Error) {
      return undefined;
    }
    return result.stdout.trim();
  }

  private async board(): Promise<string | undefined> {
    const chroot = this.chrootService.chroot();
    if (chroot === undefined) {
      return undefined;
    }
    const board = await ideUtil.getOrSelectTargetBoard(chroot);
    if (board instanceof ideUtil.NoBoardError) {
      await vscode.window.showErrorMessage(
        `Generate compilation database: ${board.message}`
      );
      return undefined;
    } else if (board === null) {
      return undefined;
    }
    return board;
  }

  private async generate(board: string, packageInfo: PackageInfo) {
    // Below, we create compilation database based on the project and the board.
    // Generating the database is time consuming involving execution of external
    // processes, so we ensure it to run only one at a time using the manager.
    await this.jobManager.offer(async () => {
      this.statusManager.setTask(STATUS_BAR_TASK_NAME, {
        status: bgTaskStatus.TaskStatus.RUNNING,
        command: SHOW_LOG_COMMAND,
      });
      try {
        metrics.send({
          category: 'background',
          group: 'cppxrefs',
          action: 'generate compdb',
        });
        await this.compdbService.generate(board, packageInfo);
        await vscode.commands.executeCommand('clangd.restart');
      } catch (e) {
        if (e instanceof CompdbError) {
          metrics.send({
            category: 'error',
            group: 'cppxrefs',
            description: e.details.kind,
          });
          if (!this.ignoredError.has(e.details.kind)) {
            this.showErrorMessageWithShowLogOption(board, e);
          }
        }

        this.log.appendLine((e as Error).message);
        console.error(e);
        this.statusManager.setTask(STATUS_BAR_TASK_NAME, {
          status: bgTaskStatus.TaskStatus.ERROR,
          command: SHOW_LOG_COMMAND,
        });
        return;
      }
      this.generated.add(packageInfo.atom);
      this.statusManager.setTask(STATUS_BAR_TASK_NAME, {
        status: bgTaskStatus.TaskStatus.OK,
        command: SHOW_LOG_COMMAND,
      });
    });
  }

  private showErrorMessageWithShowLogOption(board: string, e: CompdbError) {
    const SHOW_LOG = 'Show Log';
    const IGNORE = 'Ignore';

    const {message, button} = uiItemsForError(board, e);
    const buttons: string[] = (button ? [button.name] : []).concat(
      SHOW_LOG,
      IGNORE
    );

    // `await` cannot be used, because it blocks forever if the
    // message is dismissed by timeout.
    void vscode.window.showErrorMessage(message, ...buttons).then(value => {
      if (button && value === button.name) {
        button.action();
      } else if (value === SHOW_LOG) {
        this.log.show();
      } else if (value === IGNORE) {
        this.ignoredError.add(e.details.kind);
      }
    });
  }
}

type Button = {
  name: string;
  action: () => void;
};

function uiItemsForError(
  board: string,
  e: CompdbError
): {message: string; button?: Button} {
  switch (e.details.kind) {
    case CompdbErrorKind.RemoveCache:
      return {
        message: `Failed to generate cross reference; try removing the file ${e.details.cache} and reload the IDE`,
      };
      // TODO(oka): Add a button to open the terminal with the command to run.
      break;
    case CompdbErrorKind.RunEbuild: {
      const buildPackages = `build_packages --board=${board}`;
      return {
        message: `Failed to generate cross reference; try running "${buildPackages}" in chroot and reload the IDE`,
        button: {
          name: 'Open document',
          action: () => {
            void vscode.env.openExternal(
              vscode.Uri.parse(
                'https://chromium.googlesource.com/chromiumos/docs/+/HEAD/developer_guide.md#build-the-packages-for-your-board'
              )
            );
          },
        },
      };
    }
    case CompdbErrorKind.NotGenerated:
      return {
        message:
          'Failed to generate cross reference: compile_commands_chroot.json was not created; file a bug on go/cros-ide-new-bug',
        button: {
          name: 'File a bug',
          action: () => {
            void vscode.env.openExternal(
              vscode.Uri.parse('http://go/cros-ide-new-bug')
            );
          },
        },
      };
    case CompdbErrorKind.CopyFailed:
      return {
        message: `Failed to generate cross reference; try removing ${e.details.destination} and reload the IDE`,
        // TODO(oka): Add a button to open the terminal with the command to run.
      };
  }
}
