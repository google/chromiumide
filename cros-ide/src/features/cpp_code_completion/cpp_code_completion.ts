// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as fs from 'fs';
import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import * as ideUtil from '../../ide_util';
import {ChrootService} from '../../services/chroot';
import * as bgTaskStatus from '../../ui/bg_task_status';
import {
  CompdbError,
  CompdbErrorKind,
  CompdbService,
  CompdbServiceImpl,
} from './compdb_service';
import * as compdbService from './compdb_service';
import {CLANGD_EXTENSION, SHOW_LOG_COMMAND} from './constants';
import {Atom, PackageInfo, Packages} from './packages';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager,
  chrootService: ChrootService
) {
  const output = vscode.window.createOutputChannel('CrOS IDE: C++ Support');
  vscode.commands.registerCommand(SHOW_LOG_COMMAND.command, () =>
    output.show()
  );

  const compdbService = new CompdbServiceImpl(output, chrootService);
  context.subscriptions.push(
    new CompilationDatabase(
      statusManager,
      new Packages(),
      output,
      compdbService,
      chrootService
    )
  );
}

const STATUS_BAR_TASK_ID = 'C++ Support';

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
      this.maybeGenerate(document, false);
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
      this.statusManager.setTask(STATUS_BAR_TASK_ID, {
        status: bgTaskStatus.TaskStatus.RUNNING,
        command: SHOW_LOG_COMMAND,
      });
      try {
        await this.compdbService.generate(board, packageInfo);
        await vscode.commands.executeCommand('clangd.restart');
      } catch (e) {
        if (e instanceof CompdbError) {
          if (!this.ignoredError.has(e.details.kind)) {
            this.showErrorMessageWithShowLogOption(board, e);
          }
        }

        this.log.appendLine((e as Error).message);
        console.error(e);
        this.statusManager.setTask(STATUS_BAR_TASK_ID, {
          status: bgTaskStatus.TaskStatus.ERROR,
          command: SHOW_LOG_COMMAND,
        });
        return;
      }
      this.generated.add(packageInfo.atom);
      this.statusManager.setTask(STATUS_BAR_TASK_ID, {
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
    vscode.window.showErrorMessage(message, ...buttons).then(value => {
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
    case CompdbErrorKind.InvalidPassword:
      return {
        message: e.message,
      };
    case CompdbErrorKind.RunEbuild: {
      const buildPackages = `build_packages --board=${board}`;
      return {
        message: `Failed to generate cross reference; try running "${buildPackages}" in chroot and reload the IDE`,
        button: {
          name: 'Open document',
          action: () => {
            vscode.env.openExternal(
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
            vscode.env.openExternal(
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
