// Copyright 2022 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import * as commonUtil from '../../common/common_util';
import * as ideUtil from '../../ide_util';
import * as bgTaskStatus from '../../ui/bg_task_status';
import {
  CompdbError,
  CompdbErrorKind,
  CompdbService,
  CompdbServiceImpl,
} from './compdb_service';
import {LegacyCompdbService} from './compdb_service_legacy';
import {SHOW_LOG_COMMAND} from './constants';
import {Atom, Packages} from './packages';

export function activate(
  context: vscode.ExtensionContext,
  statusManager: bgTaskStatus.StatusManager
) {
  const log = vscode.window.createOutputChannel('CrOS IDE: C++ Support');
  vscode.commands.registerCommand(SHOW_LOG_COMMAND.command, () => log.show());

  const legacyService = new LegacyCompdbService(statusManager, log);
  const compdbService = new CompdbServiceImpl(
    log.append.bind(log),
    legacyService,
    useLegacy
  );
  context.subscriptions.push(
    new CompilationDatabase(statusManager, new Packages(), log, compdbService)
  );
}

const FASTER_CPP_XREF_GENERATION = 'underDevelopment.fasterCppXrefGeneration';

function useLegacy(): boolean {
  return !ideUtil.getConfigRoot().get(FASTER_CPP_XREF_GENERATION);
}

const STATUS_BAR_TASK_ID = 'C++ Support';

export class CompilationDatabase implements vscode.Disposable {
  private readonly jobManager = new commonUtil.JobManager<void>();
  private readonly disposables: vscode.Disposable[] = [];
  // Packages for which compdb has been generated in this session.
  private readonly generated = new Set<Atom>();
  // Store errors to avoid showing the same error many times.
  private readonly seenError: Set<CompdbErrorKind> = new Set();

  // Callbacks called after an event has been handled.
  readonly onEventHandledForTesting = new Array<() => void>();

  constructor(
    private readonly statusManager: bgTaskStatus.StatusManager,
    private readonly packages: Packages,
    private readonly log: vscode.OutputChannel,
    private readonly compdbService: CompdbService
  ) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(async editor => {
        if (editor?.document.languageId === 'cpp') {
          await this.generate(
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
          await this.generate(document);
        }
        this.onEventHandledForTesting.forEach(f => f());
      })
    );

    const document = vscode.window.activeTextEditor?.document;
    if (document) {
      this.generate(document);
    }
  }

  dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // Generate compilation database for clangd.
  private async generate(
    document: vscode.TextDocument,
    skipIfAlreadyGenerated?: boolean
  ) {
    // TODO(oka): If clangd extension is not installed, we should return here.
    if (!this.compdbService.isEnabled()) {
      return;
    }
    const packageInfo = await this.packages.fromFilepath(document.fileName);
    if (!packageInfo) {
      return;
    }
    if (skipIfAlreadyGenerated && this.generated.has(packageInfo.atom)) {
      return;
    }

    const board = await ideUtil.getOrSelectTargetBoard();
    if (board instanceof ideUtil.NoBoardError) {
      await vscode.window.showErrorMessage(
        `Generate compilation database: ${board.message}`
      );
      return;
    } else if (board === null) {
      return;
    }

    // Below, we create compilation database based on the project and the board.
    // Generating the database is time consuming involving execution of external
    // processes, so we ensure it to run only one at a time using the manager.
    await this.jobManager.offer(async () => {
      if (!this.compdbService.isEnabled()) {
        return; // early return from queued job.
      }
      try {
        await this.compdbService.generate(board, packageInfo);
        await vscode.commands.executeCommand('clangd.restart');
      } catch (e) {
        let message = (e as Error).message;
        let button: Button | undefined = undefined;
        if (e instanceof CompdbError) {
          const items = uiItemsForError(board, e);
          message = items.message;
          button = items.button;

          // TODO(oka): Add a button to show the log in addition to the button we have here.
          // It would simply run 'cros-ide.showCppLog' command.
          if (!this.seenError.has(e.details.kind)) {
            this.seenError.add(e.details.kind);
            if (button) {
              // `await` cannot be used, because it blocks forever if the
              // message is dismissed by timeout.
              vscode.window
                .showErrorMessage(message, button?.name)
                .then(value => {
                  if (value === button!.name) {
                    button!.action();
                  }
                });
            } else {
              vscode.window.showErrorMessage(message);
            }
          }
        }

        this.log.appendLine(message);
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
        message: `Faild to generate cross reference; try removing the file ${e.details.cache} and reload the IDE`,
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
          'Faild to generate cross reference: compile_commands_chroot.json was not created; file a bug on go/cros-ide-new-bug',
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
        message: `Faild to generate cross reference; try removing ${e.details.destination} and reload the IDE`,
        // TODO(oka): Add a button to open the terminal with the command to run.
      };
  }
}
